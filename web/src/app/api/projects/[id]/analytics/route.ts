import { authed, handle, ok } from "@/server/http";
import { disableAnalytics, enableAnalytics } from "@/server/analytics";

type Ctx = { params: Promise<{ id: string }> };

/** Turn analytics on and return the snippet to paste into the site. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok(await enableAnalytics(user.id, id));
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await disableAnalytics(user.id, id);
  return ok({ ok: true });
});
