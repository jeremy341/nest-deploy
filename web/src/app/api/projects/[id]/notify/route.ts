import { authed, handle, ok, readJson } from "@/server/http";
import { clearNotifications, notifyInput, setNotifications } from "@/server/notify";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const body = await readJson(req, notifyInput);
  return ok({ notify: await setNotifications(user.id, id, body) });
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await clearNotifications(user.id, id);
  return ok({ ok: true });
});
