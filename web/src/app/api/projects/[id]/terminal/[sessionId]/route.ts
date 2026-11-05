import { authed, handle, notFound, ok } from "@/server/http";
import { isSessionId, terminals } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

/** Close the terminal now. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id, sessionId } = await params;
  if (!isSessionId(sessionId)) throw notFound("Terminal session not found");
  terminals().close(user.id, id, sessionId);
  return ok({ ok: true });
});
