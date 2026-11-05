import type { NextRequest } from "next/server";
import { authed, handle, notFound } from "@/server/http";
import { isSessionId, terminals, type CloseReason } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

const HEARTBEAT_MS = 15_000;
/** Bytes the stream may hold for a slow reader before the reader is dropped (it reconnects and resumes from the buffer). */
const HIGH_WATER_BYTES = 256 * 1024;
const DROP_SLOW_READER_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

/**
 * Terminal output as Server-Sent Events. Events:
 *
 *   event: ready   data: {}                  the stream is open; clear the screen, a replay follows
 *   event: out     data: <base64 of bytes>   a chunk of terminal output (raw bytes, so UTF-8 that
 *                                            splits between chunks still decodes). The first `out`
 *                                            is the buffered tail (last 64 KB) when there is one.
 *   event: end     data: {"reason": "..."}   the session closed (closed, idle, limit, shell-exit,
 *                                            connection-lost, error); the stream then ends
 *   : ping                                   comment every 15 s to keep the connection open
 *
 * Owner only: any other session id, or one that belongs to someone else, is a 404.
 * Nothing here logs the bytes.
 */
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const user = await authed();
  const { id, sessionId } = await params;
  if (!isSessionId(sessionId)) throw notFound("Terminal session not found");

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let finished = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe = () => {};
  const queued: Uint8Array[] = [];

  const stop = () => {
    if (finished) return;
    finished = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    try {
      controller?.close();
    } catch {
      // Already closed by the client going away.
    }
  };
  const write = (text: string) => {
    const bytes = encoder.encode(text);
    if (!controller) {
      queued.push(bytes);
      return;
    }
    try {
      controller.enqueue(bytes);
      // A reader that cannot keep up must not make the server hold unbounded output.
      if (controller.desiredSize !== null && controller.desiredSize < -DROP_SLOW_READER_BYTES) stop();
    } catch {
      stop();
    }
  };
  const event = (name: string, data: string) => write(`event: ${name}\ndata: ${data}\n\n`);
  const end = (reason: CloseReason) => {
    event("end", JSON.stringify({ reason }));
    stop();
  };

  // Subscribing before the Response exists means a missing or foreign session
  // is a plain 404 JSON error instead of a stream that fails.
  event("ready", "{}");
  const sub = terminals().subscribe(user.id, id, sessionId, {
    onData: (chunk) => event("out", chunk.toString("base64")),
    onEnd: end,
  });
  if ("ended" in sub) {
    end(sub.ended);
  } else {
    unsubscribe = sub.unsubscribe;
    if (sub.replay.length > 0) event("out", sub.replay.toString("base64"));
  }

  req.signal.addEventListener("abort", stop, { once: true });

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const bytes of queued) c.enqueue(bytes);
      queued.length = 0;
      if (finished) {
        try {
          c.close();
        } catch {
          // Nothing to do.
        }
        return;
      }
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    },
    cancel: stop,
  }, { highWaterMark: HIGH_WATER_BYTES, size: (chunk) => chunk.byteLength });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
