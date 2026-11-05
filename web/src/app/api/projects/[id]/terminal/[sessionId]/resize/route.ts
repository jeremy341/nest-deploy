import { z } from "zod";
import { authed, handle, notFound, ok, readJson } from "@/server/http";
import { isSessionId, terminals } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

// Bounds are enforced by the session manager; this only makes sure they are numbers.
const resize = z.object({ cols: z.number(), rows: z.number() });

/** Tell the shell the window changed size. Not counted as activity. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id, sessionId } = await params;
  if (!isSessionId(sessionId)) throw notFound("Terminal session not found");
  const size = await readJson(req, resize);
  terminals().resize(user.id, id, sessionId, size);
  return ok({ ok: true });
});
