import { NextResponse, type NextRequest } from "next/server";
import { completeLogin } from "@/server/auth/hackclub";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
  upsertUser,
} from "@/server/auth/session";
import { config } from "@/server/config";
import { safeEqual } from "@/server/crypto";

function back(error: string) {
  const url = new URL("/login", config().APP_URL);
  url.searchParams.set("error", error);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("denied");

  const code = params.get("code");
  const state = params.get("state");
  const raw = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!code || !state || !raw) return back("invalid_request");

  let saved: { s: string; v: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return back("invalid_request");
  }
  if (!safeEqual(saved.s ?? "", state)) return back("state_mismatch");

  try {
    const profile = await completeLogin(code, saved.v);
    const user = await upsertUser(profile);
    const session = await createSession(user.id, req.headers.get("user-agent"));
    const res = NextResponse.redirect(new URL("/", config().APP_URL), 303);
    res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return res;
  } catch (err) {
    console.error("Hack Club login failed", err);
    return back("login_failed");
  }
}
