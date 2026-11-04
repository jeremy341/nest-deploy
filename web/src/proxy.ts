import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap first gate: no session cookie means no dashboard. Real validation
 * (expiry, revocation) happens in the server code that reads the session.
 */
const PUBLIC = [
  /^\/$/,
  /^\/login$/,
  /^\/api\/auth\//,
  /^\/api\/webhooks\//,
  /^\/api\/hooks\//,
  /^\/docs(\/|$)/,
  // Public by design: the analytics snippet, its collector, and status pages.
  /^\/api\/analytics\/script$/,
  /^\/api\/collect\//,
  /^\/status\//,
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();
  if (req.cookies.has("nd_session")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
