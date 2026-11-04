import { SESSION_COOKIE } from "@/server/auth/session";
import { revokeSession } from "@/server/account";
import { authed, handle, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await revokeSession(user.id, id, req.cookies.get(SESSION_COOKIE)?.value);
  return ok({ ok: true });
});
