import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SESSION_COOKIE, userForSessionToken, type SessionUser } from "@/server/auth/session";

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session expiry compares against the current time, which Cache Components
  // only allows after the request is known. Mark this as request-time work.
  await connection();
  const jar = await cookies();
  return userForSessionToken(jar.get(SESSION_COOKIE)?.value);
});

/** For pages and server actions: redirect to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
