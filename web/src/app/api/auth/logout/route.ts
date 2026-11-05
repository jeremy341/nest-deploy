import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, deleteSession, userForSessionToken } from "@/server/auth/session";
import { handle } from "@/server/http";
import { config } from "@/server/config";
import { terminals } from "@/server/terminal";

export const POST = handle(async (req: NextRequest) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  // Shells opened by this account end with the sign-out, before the session goes.
  const user = await userForSessionToken(token);
  if (user) await terminals().closeAllForUser(user.id, "signed-out");
  await deleteSession(token);
  const res = NextResponse.redirect(new URL("/login", config().APP_URL), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
