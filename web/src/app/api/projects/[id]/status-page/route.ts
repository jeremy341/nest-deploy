import { authed, handle, ok } from "@/server/http";
import { disableStatusPage, enableStatusPage } from "@/server/status-page";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok(await enableStatusPage(user.id, id));
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await disableStatusPage(user.id, id);
  return ok({ ok: true });
});
