import { removeDomain, updateDomain } from "@/server/domains";
import { authed, handle, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok(await updateDomain(user.id, id, await req.json().catch(() => ({}))));
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await removeDomain(user.id, id);
  return ok({ ok: true });
});
