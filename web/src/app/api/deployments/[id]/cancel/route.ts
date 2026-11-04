import { authed, handle, ok } from "@/server/http";
import { cancelDeployment } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const result = await cancelDeployment(user.id, id);
  return ok({ deployment: result ?? null }, 200);
});
