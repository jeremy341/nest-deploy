import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getPublicStats } from "@/server/stats-cache";

/**
 * Public, aggregate usage figures. Counts and totals only, already rounded in
 * server/stats.ts: nothing here names a person or a project. Anyone may read
 * it, so there is no sign-in and no cookie, and browsers and CDNs may keep it
 * for five minutes.
 */
export async function GET() {
  await connection();
  const stats = await getPublicStats();
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
