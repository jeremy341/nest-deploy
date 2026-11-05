import { cacheLife } from "next/cache";
import { computeStats } from "@/server/stats";

/**
 * The stats, computed at most once every five minutes however many people look.
 * Kept apart from stats.ts so that file stays plain and testable.
 */
export async function getPublicStats() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return computeStats();
}
