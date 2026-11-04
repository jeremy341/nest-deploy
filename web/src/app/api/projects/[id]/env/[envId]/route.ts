import { authed, handle, ok } from "@/server/http";
import { deleteEnvVar } from "@/server/projects";

type Ctx = { params: Promise<{ id: string; envId: string }> };

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id, envId } = await params;
  await deleteEnvVar(user.id, id, envId);
  return ok({ ok: true });
});
