import { and, count, countDistinct, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { formatCount, type Count } from "@/lib/stats-format";
import { getDb, schema } from "@/server/db";

export { formatCount };
export type { Count };

/**
 * Public usage statistics: totals only. Nothing in here names a person or a
 * project, and every figure that leaves this module is already rounded, so the
 * page and the JSON route cannot show more than the rules allow.
 *
 * Rules: a figure under 10 becomes "fewer than 10"; a larger one keeps two
 * significant figures. The daily series is a total of all deployments with no
 * split by user, and a day with 1 to 9 deployments is also "fewer than 10".
 * Only a day with none is shown as an exact zero.
 */

/** Below this a count could point at one person, so it is not shown. */
export const SMALL_COUNT = 10;
/** The success rate needs at least this many finished deployments behind it. */
export const MIN_FINISHED = 50;
export const WINDOW_DAYS = 30;


export type DailyPoint = { date: string; count: Count };

export type PublicStats = {
  /** ISO time the numbers were computed. */
  generatedAt: string;
  windowDays: number;
  accounts: Count;
  serversConnected: Count;
  /** Projects with at least one ready deployment. */
  projectsDeployed: Count;
  /** Projects with a public status page switched on. */
  statusPages: Count;
  deployments: {
    /** Deployments created in the window. */
    total: Count;
    /** One entry per UTC day, oldest first, ending today. Days without any are 0. */
    daily: DailyPoint[];
  };
  successRate: {
    /** Whole percent of finished deployments that were ready, or null when the sample is too small. */
    percent: number | null;
    /** Deployments that finished (ready or failed) in the window. */
    finished: Count;
    minimumFinished: number;
  };
};

/**
 * Round a count for public display. Under 10 (including 0) becomes
 * "fewer than 10"; otherwise two significant figures, so 1,234 is 1,200.
 */
export function roundCount(n: number): Count {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (v < SMALL_COUNT) return { lessThan: SMALL_COUNT };
  const digits = String(v).length;
  const step = 10 ** (digits - 2);
  return { approx: Math.round(v / step) * step };
}

/** Like roundCount, but a day with no deployments is an honest zero. */
export function roundDaily(n: number): Count {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return v === 0 ? { approx: 0 } : roundCount(v);
}

/** The i-th UTC calendar day as YYYY-MM-DD. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Midnight UTC of the first day of the window, which ends with today. */
export function windowStart(now: Date, days = WINDOW_DAYS): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

/**
 * Lay per-day totals out on a fixed run of UTC days ending today, oldest
 * first. Days with no row become 0 rather than being left out, and rows
 * outside the window or with a malformed day are ignored. Pure.
 */
export function bucketDaily(
  rows: { day: string; n: number }[],
  now: Date,
  days = WINDOW_DAYS
): { date: string; count: number }[] {
  const start = windowStart(now, days).getTime();
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.day, (totals.get(r.day) ?? 0) + Number(r.n || 0));
  return Array.from({ length: days }, (_, i) => {
    const date = isoDay(start + i * DAY_MS);
    return { date, count: totals.get(date) ?? 0 };
  });
}

/**
 * Share of finished deployments that succeeded. Canceled deployments are not
 * finished work and are left out. Under MIN_FINISHED finished deployments the
 * percentage is withheld. A rate is never rounded up to 100 while a failure
 * exists, or down to 0 while a success exists. Pure.
 */
export function successShare(ready: number, failed: number, minimum = MIN_FINISHED) {
  const finished = Math.max(0, ready) + Math.max(0, failed);
  if (finished < minimum) return { percent: null as number | null, finished };
  let percent = Math.round((ready / finished) * 100);
  if (percent === 100 && failed > 0) percent = 99;
  if (percent === 0 && ready > 0) percent = 1;
  return { percent: percent as number | null, finished };
}

/** Query the database and return only rounded, aggregate figures. */
export async function computeStats(now = new Date()): Promise<PublicStats> {
  const db = await getDb();
  const start = windowStart(now);
  const inWindow = gte(schema.deployments.createdAt, start);
  const day = sql<string>`strftime('%Y-%m-%d', ${schema.deployments.createdAt} / 1000, 'unixepoch')`;

  const [users] = await db.select({ n: count() }).from(schema.users);
  const [servers] = await db
    .select({ n: countDistinct(schema.servers.id) })
    .from(schema.servers)
    .where(eq(schema.servers.status, "connected"));
  const [deployedProjects] = await db
    .select({ n: countDistinct(schema.deployments.projectId) })
    .from(schema.deployments)
    .where(eq(schema.deployments.state, "ready"));
  const [pages] = await db
    .select({ n: count() })
    .from(schema.projects)
    .where(isNotNull(schema.projects.statusKey));
  const perDay = await db
    .select({ day, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(day);
  const finishedByState = await db
    .select({ state: schema.deployments.state, n: count() })
    .from(schema.deployments)
    .where(and(inWindow, inArray(schema.deployments.state, ["ready", "error"])))
    .groupBy(schema.deployments.state);

  const daily = bucketDaily(perDay, now);
  const total = daily.reduce((sum, d) => sum + d.count, 0);
  const ready = finishedByState.find((r) => r.state === "ready")?.n ?? 0;
  const failed = finishedByState.find((r) => r.state === "error")?.n ?? 0;
  const share = successShare(ready, failed);

  return {
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    accounts: roundCount(users.n),
    serversConnected: roundCount(servers.n),
    projectsDeployed: roundCount(deployedProjects.n),
    statusPages: roundCount(pages.n),
    deployments: {
      total: roundCount(total),
      daily: daily.map((d) => ({ date: d.date, count: roundDaily(d.count) })),
    },
    successRate: {
      percent: share.percent,
      finished: roundCount(share.finished),
      minimumFinished: MIN_FINISHED,
    },
  };
}
