import { authed, handle } from "@/server/http";
import { getDb, schema } from "@/server/db";
import { deploymentLogs, ownedDeployment } from "@/server/projects";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

const FINISHED = new Set(["ready", "error", "canceled"]);

/**
 * Server-sent events: each log line as it is written, then a final "state"
 * event. Reconnect with ?after=<last id> to resume without repeats.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await ownedDeployment(user.id, id);

  let after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, evId?: number) => {
        controller.enqueue(
          encoder.encode(
            (evId ? `id: ${evId}\n` : "") +
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          )
        );
      };
      const db = await getDb();
      try {
        for (let i = 0; i < 20 * 60 * 15 && !req.signal.aborted; i++) {
          const lines = await deploymentLogs(user.id, id, after);
          for (const l of lines) {
            after = l.id;
            send("log", { id: l.id, at: l.at, level: l.level, message: l.message }, l.id);
          }
          const row = await db
            .select({ state: schema.deployments.state, error: schema.deployments.error })
            .from(schema.deployments)
            .where(eq(schema.deployments.id, id))
            .get();
          if (row && FINISHED.has(row.state)) {
            // One more read so lines written just before the state change arrive.
            const rest = await deploymentLogs(user.id, id, after);
            for (const l of rest) {
              after = l.id;
              send("log", { id: l.id, at: l.at, level: l.level, message: l.message }, l.id);
            }
            send("state", row);
            break;
          }
          if (i % 20 === 19) controller.enqueue(encoder.encode(": keepalive\n\n"));
          await new Promise((r) => setTimeout(r, 750));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
