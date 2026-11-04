import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { randomToken, sha256Hex } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError } from "@/server/http";
import { getProjectForUser } from "@/server/projects";

/**
 * Page-view analytics for the apps people deploy.
 *
 * Nest does not give us the proxy's access log, so the numbers come from a
 * small script the owner adds to their site. It reports the path and the
 * referring site and nothing else. We store no IP address and set no cookie.
 * The visitor id is a hash of IP, browser and project that is salted with the
 * date, so it can count one day's visitors but cannot follow a person.
 */

const KEY_PREFIX = "nda_";
export const PAGEVIEW_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export function snippet(key: string): string {
  const base = config().APP_URL.replace(/\/$/, "");
  return `<script defer data-key="${key}" src="${base}/api/analytics/script"></script>`;
}

export async function enableAnalytics(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  if (project.analyticsKey) return { key: project.analyticsKey, snippet: snippet(project.analyticsKey) };
  const key = KEY_PREFIX + randomToken(12);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ analyticsKey: key, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await audit(userId, "analytics.enable", project.id);
  return { key, snippet: snippet(key) };
}

/** Stop collecting. Existing numbers stay until they age out. */
export async function disableAnalytics(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ analyticsKey: null, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await audit(userId, "analytics.disable", project.id);
}

// ------------------------------------------------------------ collecting

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python-requests/i;

/** "/a/b?x=1#y" becomes "/a/b". Anything that is not a path becomes "/". */
export function cleanPath(raw: string): string {
  let p = raw.trim();
  p = p.split("#")[0].split("?")[0];
  if (!p.startsWith("/")) return "/";
  p = p.slice(0, 200);
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p;
}

/** The host of a referrer, or null when there is none or it is not a web address. */
export function cleanReferrer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "").slice(0, 100) || null;
  } catch {
    return null;
  }
}

export function visitorHash(args: { projectId: string; ip: string; ua: string; day: string }): string {
  return sha256Hex(`${config().APP_SECRET}|${args.day}|${args.projectId}|${args.ip}|${args.ua}`).slice(0, 16);
}

const hit = z.object({ p: z.string().max(2000).default("/"), r: z.string().max(2000).optional() });

// One page view per second per project and address is generous for a person and
// stops a loop from filling the database.
const recent = new Map<string, number>();
function tooFast(key: string, now: number): boolean {
  const last = recent.get(key) ?? 0;
  if (now - last < 1000) return true;
  recent.set(key, now);
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k);
  return false;
}

export async function recordPageview(
  key: string,
  raw: unknown,
  who: { ip: string; ua: string },
  now = new Date()
): Promise<boolean> {
  if (!key.startsWith(KEY_PREFIX) || BOT.test(who.ua)) return false;
  const parsed = hit.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Bad page view", "validation");
  const db = await getDb();
  const project = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.analyticsKey, key))
    .get();
  if (!project) return false;
  if (tooFast(`${project.id}|${who.ip}`, now.getTime())) return false;
  await db.insert(schema.pageviews).values({
    projectId: project.id,
    at: now,
    path: cleanPath(parsed.data.p),
    referrer: cleanReferrer(parsed.data.r),
    visitor: visitorHash({
      projectId: project.id,
      ip: who.ip,
      ua: who.ua,
      day: now.toISOString().slice(0, 10),
    }),
  });
  return true;
}

export async function prunePageviews(now = new Date()) {
  const db = await getDb();
  await db.delete(schema.pageviews).where(lt(schema.pageviews.at, new Date(now.getTime() - PAGEVIEW_KEEP_MS)));
}

// ------------------------------------------------------------ reading

export type AnalyticsSummary = {
  days: number;
  views: number;
  /** Distinct visitors per day, added up. The same person on two days counts twice. */
  visitors: number;
  daily: { day: string; views: number; visitors: number }[];
  pages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
};

const dayExpr = sql<string>`strftime('%Y-%m-%d', ${schema.pageviews.at} / 1000, 'unixepoch')`;

export async function analyticsSummary(
  userId: string,
  projectId: string,
  days = 30,
  now = new Date()
): Promise<AnalyticsSummary> {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  const since = new Date(now.getTime() - days * 86_400_000);
  const where = and(eq(schema.pageviews.projectId, project.id), gte(schema.pageviews.at, since));

  const rows = await db
    .select({
      day: dayExpr,
      views: sql<number>`count(*)`,
      visitors: sql<number>`count(distinct ${schema.pageviews.visitor})`,
    })
    .from(schema.pageviews)
    .where(where)
    .groupBy(dayExpr);
  const byDay = new Map(rows.map((r) => [r.day, r]));

  // Every day in the range, so a quiet day is a zero and not a missing bar.
  const daily: AnalyticsSummary["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(day);
    daily.push({ day, views: Number(r?.views ?? 0), visitors: Number(r?.visitors ?? 0) });
  }

  const pages = await db
    .select({ path: schema.pageviews.path, views: sql<number>`count(*)` })
    .from(schema.pageviews)
    .where(where)
    .groupBy(schema.pageviews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  const referrers = await db
    .select({ host: schema.pageviews.referrer, views: sql<number>`count(*)` })
    .from(schema.pageviews)
    .where(and(where, sql`${schema.pageviews.referrer} is not null`))
    .groupBy(schema.pageviews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    days,
    views: daily.reduce((n, d) => n + d.views, 0),
    visitors: daily.reduce((n, d) => n + d.visitors, 0),
    daily,
    pages: pages.map((p) => ({ path: p.path, views: Number(p.views) })),
    referrers: referrers.map((r) => ({ host: r.host ?? "", views: Number(r.views) })),
  };
}
