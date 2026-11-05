import { NextResponse, type NextRequest } from "next/server";
import { completeLogin } from "@/server/auth/hackclub";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  createSession,
  markFreshAuth,
  sessionCookieOptions,
  upsertUser,
  userForSessionToken,
} from "@/server/auth/session";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { safeEqual } from "@/server/crypto";

function back(error: string, to = "/login") {
  const url = new URL(to, config().APP_URL);
  url.searchParams.set(to === "/login" ? "error" : "reauth", error);
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

  let saved: { s: string; v: string; p?: string; n?: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return back("invalid_request");
  }
  if (!safeEqual(saved.s ?? "", state)) return back("state_mismatch");

  try {
    const profile = await completeLogin(code, saved.v);

    if (saved.p === "reauth") {
      // Confirming again: the same Hack Club account must be the one signed in here.
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      const user = await userForSessionToken(token);
      if (!user || !token || user.hackClubId !== profile.id) return back("mismatch", "/account");
      await markFreshAuth(token);
      await audit(user.id, "auth.reauth");
      const next = typeof saved.n === "string" && saved.n.startsWith("/") && !saved.n.startsWith("//") ? saved.n : "/account";
      const res = NextResponse.redirect(new URL(next, config().APP_URL), 303);
      res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
      return res;
    }
    const user = await upsertUser(profile);
    const session = await createSession(user.id, req.headers.get("user-agent"));
    const res = NextResponse.redirect(new URL("/projects", config().APP_URL), 303);
    res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return res;
  } catch (err) {
    console.error("Hack Club login failed", err);
    return back("login_failed");
  }
}
