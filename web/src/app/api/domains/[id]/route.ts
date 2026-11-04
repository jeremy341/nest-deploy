import { removeDomain } from "@/server/domains";
import { authed, handle, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await removeDomain(user.id, id);
  return ok({ ok: true });
});
