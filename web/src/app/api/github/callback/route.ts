import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/current";
import { config } from "@/server/config";
import { safeEqual } from "@/server/crypto";
import { installationsForCode, saveInstallations } from "@/server/github/app";

function back(status: string) {
  const res = NextResponse.redirect(new URL(`/new?github=${status}`, config().APP_URL), 303);
  res.cookies.delete({ name: "nd_gh_state", path: "/api/github" });
  return res;
}

/** GitHub sends the user here after they authorize or install the App. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", config().APP_URL), 303);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = req.cookies.get("nd_gh_state")?.value;
  if (!code || !state || !saved || !safeEqual(saved, state)) return back("invalid_state");

  try {
    await saveInstallations(user.id, await installationsForCode(code));
    return back("connected");
  } catch (err) {
    console.error("GitHub link failed", err);
    return back("failed");
  }
}
