import { authed, handle, ok } from "@/server/http";
import { sendTestNotification } from "@/server/notify";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await sendTestNotification(user.id, id);
  return ok({ ok: true });
});
