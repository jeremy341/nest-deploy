import { authed, handle, ok } from "@/server/http";
import { rollback } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const result = await rollback(user.id, id);
  return ok({ deployment: result ?? null }, 202);
});
