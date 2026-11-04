import { connection, NextResponse, type NextRequest } from "next/server";
import { createAuthRequest } from "@/server/auth/hackclub";
import { OAUTH_COOKIE } from "@/server/auth/session";
import { config, hackClubConfigured } from "@/server/config";

export async function GET(req: NextRequest) {
  // Each login needs a fresh state value, so never prerender this route.
  await connection();
  if (!hackClubConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=not_configured", config().APP_URL),
      303
    );
  }
  const auth = createAuthRequest();
  const res = NextResponse.redirect(auth.url, 303);
  res.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ s: auth.state, v: auth.codeVerifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth",
      maxAge: 600,
    }
  );
  void req;
  return res;
}
