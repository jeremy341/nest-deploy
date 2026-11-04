import { SESSION_COOKIE } from "@/server/auth/session";
import { revokeOtherSessions } from "@/server/account";
import { authed, handle, ok } from "@/server/http";

/** Sign out every browser except this one. */
export const DELETE = handle(async (req) => {
  const user = await authed();
  const count = await revokeOtherSessions(user.id, req.cookies.get(SESSION_COOKIE)?.value);
  return ok({ count });
});
