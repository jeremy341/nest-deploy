import { z } from "zod";
import { authed, handle, HttpError, notFound, ok, readJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { isSessionId, terminals, TERMINAL_LIMITS } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

// JSON escaping can make a payload several times longer than the keystrokes it
// carries, so the body gets generous room; the byte limit is checked on `data`.
const MAX_BODY_BYTES = 8 * TERMINAL_LIMITS.inputBytes;

const input = z.object({ data: z.string().min(1).max(TERMINAL_LIMITS.inputBytes) });

/**
 * Keystrokes from the browser. Same-origin only (the handle wrapper), owner
 * only, at most 8 KB per request and 300 requests a minute per user. Counts as activity for the idle timer.
 * The body is never logged.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id, sessionId } = await params;
  if (!isSessionId(sessionId)) throw notFound("Terminal session not found");
  enforceRateLimit("terminalInput", user.id);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    throw new HttpError(413, "That is too much input at once.", "too_large");
  }
  const { data } = await readJson(req, input);
  const info = terminals().write(user.id, id, sessionId, data);
  return ok({ expiresAt: info.expiresAt, serverNow: info.serverNow });
});
