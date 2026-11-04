import { authed, handle, ok } from "@/server/http";
import { deleteServer, getServerForUser, publicServer } from "@/server/servers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ server: publicServer(await getServerForUser(user.id, id)) });
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await deleteServer(user.id, id);
  return ok({ ok: true });
});
