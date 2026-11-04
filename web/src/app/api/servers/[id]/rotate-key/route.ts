import { authed, handle, ok } from "@/server/http";
import { publicServer, rotateServerKey } from "@/server/servers";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ server: publicServer(await rotateServerKey(user.id, id)) });
});
