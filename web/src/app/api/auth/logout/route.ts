import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, deleteSession } from "@/server/auth/session";
import { handle } from "@/server/http";
import { config } from "@/server/config";

export const POST = handle(async (req: NextRequest) => {
  await deleteSession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(new URL("/login", config().APP_URL), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
