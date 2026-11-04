import { authed, handle, ok } from "@/server/http";
import { createDeployHook, revokeDeployHook } from "@/server/hooks";

type Ctx = { params: Promise<{ id: string }> };

/** Create, or replace, the deploy hook. The URL is returned once. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { url } = await createDeployHook(user.id, id);
  return ok({ url }, 201);
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await revokeDeployHook(user.id, id);
  return ok({ ok: true });
});
