import { and, count, countDistinct, eq, gt, gte, inArray, isNotNull, isNull, like, lt, sql } from "drizzle-orm";
import { formatCount, type Count, type Direction } from "@/lib/stats-format";
import { getDb, schema } from "@/server/db";

export { formatCount };
export type { Count, Direction };

/**
 * Public usage statistics: totals only. Nothing in here names a person or a
 * project, and every figure that leaves this module is already rounded, so the
 * page and the JSON route cannot show more than the rules allow.
 *
 * Rules, applied to every figure below:
 *  - a count under 10 becomes "fewer than 10"; a larger one keeps two
 *    significant figures;
 *  - a series (per day, weekday, hour, runtime) hides any bucket under 10 the
 *    same way, so no bucket can point at one person or one project. Only a day
 *    with no deployments at all is shown as an exact zero;
 *  - a percentage names its denominator and is withheld ("Not enough data")
 *    below the minimum sample of 50;
 *  - a median or percentile needs at least 50 builds behind it.
 *
 * All days, weekdays and hours are UTC.
 */

/** Below this a count could point at one person, so it is not shown. */
export const SMALL_COUNT = 10;
/** A bucket in a series (weekday, hour, runtime) needs at least this many before a value is shown. */
export const MIN_BUCKET = SMALL_COUNT;
/** A percentage, median or percentile needs at least this many items behind it. */
export const MIN_SAMPLE = 50;
/** The success rate needs at least this many finished deployments behind it. */
export const MIN_FINISHED = MIN_SAMPLE;
/** The median and 90th percentile build time need at least this many finished builds. */
export const MIN_BUILDS = MIN_SAMPLE;
/** The share of projects that were up needs at least this many checked projects. */
export const MIN_CHECKED = MIN_SAMPLE;
/** A growth percentage needs both weeks to have at least this many sign-ups. */
export const MIN_GROWTH_BASE = MIN_SAMPLE;
export const WINDOW_DAYS = 30;
export const GROWTH_DAYS = 7;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

export type DailyPoint = { date: string; count: Count };

export type PublicStats = {
  /** ISO time the numbers were computed. */
  generatedAt: string;
  windowDays: number;
  accounts: Count;
  /** New accounts in the last 7 days against the 7 days before. */
  growth: {
    windowDays: number;
    last: Count;
    previous: Count;
    direction: Direction;
    /** Whole percent change on the rounded counts, or null unless both weeks have at least `minimumForPercent`. */
    percentChange: number | null;
    minimumForPercent: number;
  };
  serversConnected: Count;
  /** Projects with at least one ready deployment. */
  projectsDeployed: Count;
  /** Projects with a public status page switched on. */
  statusPages: Count;
  /** Domains whose DNS check passed. */
  domainsMapped: Count;
  /** Counts of access tokens and of deployments started through the API. Not a measure of how much tokens are used. */
  api: {
    /** Tokens that are neither revoked nor expired. */
    tokensActive: Count;
    /** Deployments started through the API (including by AI agents) in the window. */
    deploymentsViaApi: Count;
  };
  deployments: {
    /** Deployments created in the window. */
    total: Count;
    /** One entry per UTC day, oldest first, ending today. Days without any are 0. */
    daily: DailyPoint[];
    /** Every deployment created in the window, by how it ended. Others are still in progress. */
    outcomes: { ready: Count; error: Count; canceled: Count };
    byEnvironment: { production: Count; preview: Count };
    /** Monday first. Some weekdays occur five times in 30 days and some four. */
    byWeekday: { weekday: WeekdayName; count: Count }[];
    /** 24 buckets, 00:00 to 23:00 UTC. A bucket under `minimumBucket` is a bound, never a value. */
    byHour: { minimumBucket: number; buckets: { hour: number; count: Count }[] };
  };
  successRate: {
    /** Whole percent of finished deployments that were ready, or null when the sample is too small. */
    percent: number | null;
    /** Deployments that finished (ready or failed) in the window. */
    finished: Count;
    minimumFinished: number;
  };
  buildTime: {
    /** Finished deployments (ready or failed) with a start and end time in the window. */
    finished: Count;
    minimumFinished: number;
    /** Whole seconds from the start of a deployment to its end, or null when the sample is too small. */
    medianSeconds: number | null;
    p90Seconds: number | null;
  };
  /** Projects per runtime, in a fixed order. */
  runtimes: { runtime: string; count: Count }[];
  monitoring: {
    /** Projects whose uptime check has run at least once. */
    checked: Count;
    minimumChecked: number;
    /** Whole percent of checked projects that were up at their last check, or null when the sample is too small. */
    upPercent: number | null;
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

/** A bucket of a series: under MIN_BUCKET (including 0) is "fewer than 10", so an empty hour cannot single anyone out. */
export function roundBucket(n: number): Count {
  return roundCount(n);
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
 * Fold per-weekday totals into seven buckets, Monday first. The input is the
 * number SQLite's strftime('%w') gives (0 is Sunday, in UTC). Rows with an
 * unknown weekday are ignored and repeated rows add up. Pure.
 */
export function bucketWeekdays(rows: { w: string | number; n: number }[]): number[] {
  const out = new Array<number>(7).fill(0);
  for (const r of rows) {
    const w = Number(r.w);
    if (!Number.isInteger(w) || w < 0 || w > 6) continue;
    out[(w + 6) % 7] += Number(r.n || 0);
  }
  return out;
}

/** Fold per-hour totals into 24 buckets (strftime('%H'), in UTC). Rows with an unknown hour are ignored. Pure. */
export function bucketHours(rows: { h: string | number; n: number }[]): number[] {
  const out = new Array<number>(24).fill(0);
  for (const r of rows) {
    const h = Number(r.h);
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    out[h] += Number(r.n || 0);
  }
  return out;
}

/**
 * A percentage of `part` out of `part + other`, withheld below `minimum`
 * items. It is never rounded up to 100 while `other` is not zero, or down to 0
 * while `part` is not zero. Pure.
 */
export function percentShare(part: number, other: number, minimum = MIN_SAMPLE) {
  const total = Math.max(0, part) + Math.max(0, other);
  if (total < minimum) return { percent: null as number | null, total };
  let percent = Math.round((part / total) * 100);
  if (percent === 100 && other > 0) percent = 99;
  if (percent === 0 && part > 0) percent = 1;
  return { percent: percent as number | null, total };
}

/**
 * Share of finished deployments that succeeded. Canceled deployments are not
 * finished work and are left out. Under MIN_FINISHED finished deployments the
 * percentage is withheld. Pure.
 */
export function successShare(ready: number, failed: number, minimum = MIN_FINISHED) {
  const { percent, total } = percentShare(ready, failed, minimum);
  return { percent, finished: total };
}

/**
 * The p-th percentile (0 to 1) of an ascending list by linear interpolation
 * between the two nearest values, so with an even count the median is the
 * mean of the middle pair. Returns null for an empty list. Pure.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
  const n = sortedAscending.length;
  if (n === 0) return null;
  const rank = Math.min(1, Math.max(0, p)) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sortedAscending[lo] + (sortedAscending[hi] - sortedAscending[lo]) * (rank - lo);
}

/**
 * Median and 90th percentile build time in whole seconds from durations in
 * milliseconds. A negative or non-finite duration is a bad row and is left out.
 * Under `minimum` builds neither is returned. `sample` is the number of
 * builds used. Pure.
 */
export function buildTimes(durationsMs: number[], minimum = MIN_BUILDS) {
  const good = durationsMs.filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  if (good.length < minimum) return { sample: good.length, medianSeconds: null, p90Seconds: null };
  const seconds = (p: number) => Math.round((percentile(good, p) as number) / 1000);
  return { sample: good.length, medianSeconds: seconds(0.5), p90Seconds: seconds(0.9) };
}

/** A change of less than this, on counts that are already rounded, is "about the same". */
const SAME_BAND = 0.1;
/** With a side under 10, a gap smaller than this many sign-ups is "about the same". */
const SMALL_GAP = 3;

/**
 * Compare this week's sign-ups with last week's. Pure.
 *  - Either week under 10: only a direction, and a gap under 3 is "about the
 *    same", so one extra sign-up never reads as growth.
 *  - Both at least 10: the direction comes from the rounded counts, with a
 *    band of 10 percent around "about the same".
 *  - A whole percent is added only when both weeks have at least
 *    MIN_GROWTH_BASE sign-ups; it is computed from the rounded counts, so it
 *    says no more than the counts beside it.
 */
export function growthDirection(current: number, previous: number) {
  const cur = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  const prev = Number.isFinite(previous) ? Math.max(0, Math.floor(previous)) : 0;
  if (cur < SMALL_COUNT || prev < SMALL_COUNT) {
    const gap = cur - prev;
    const direction: Direction = Math.abs(gap) < SMALL_GAP ? "same" : gap > 0 ? "up" : "down";
    return { direction, percentChange: null as number | null };
  }
  const c = (roundCount(cur) as { approx: number }).approx;
  const p = (roundCount(prev) as { approx: number }).approx;
  const change = (c - p) / p;
  const direction: Direction = Math.abs(change) < SAME_BAND ? "same" : change > 0 ? "up" : "down";
  const percentChange = cur >= MIN_GROWTH_BASE && prev >= MIN_GROWTH_BASE ? Math.round(change * 100) : null;
  return { direction, percentChange: percentChange as number | null };
}

/** Query the database and return only rounded, aggregate figures. */
export async function computeStats(now = new Date()): Promise<PublicStats> {
  const db = await getDb();
  const start = windowStart(now);
  const inWindow = gte(schema.deployments.createdAt, start);
  const day = sql<string>`strftime('%Y-%m-%d', ${schema.deployments.createdAt} / 1000, 'unixepoch')`;
  const weekday = sql<string>`strftime('%w', ${schema.deployments.createdAt} / 1000, 'unixepoch')`;
  const hour = sql<string>`strftime('%H', ${schema.deployments.createdAt} / 1000, 'unixepoch')`;

  const thisWeek = new Date(now.getTime() - GROWTH_DAYS * DAY_MS);
  const lastWeek = new Date(now.getTime() - 2 * GROWTH_DAYS * DAY_MS);

  const [users] = await db.select({ n: count() }).from(schema.users);
  const [newThisWeek] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(and(gte(schema.users.createdAt, thisWeek), lt(schema.users.createdAt, now)));
  const [newLastWeek] = await db
    .select({ n: count() })
    .from(schema.users)
    .where(and(gte(schema.users.createdAt, lastWeek), lt(schema.users.createdAt, thisWeek)));
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
  const [domains] = await db
    .select({ n: count() })
    .from(schema.domains)
    .where(eq(schema.domains.status, "valid"));
  const [tokens] = await db
    .select({ n: count() })
    .from(schema.apiTokens)
    .where(and(isNull(schema.apiTokens.revokedAt), gt(schema.apiTokens.expiresAt, now)));
  // An API deploy always writes this audit row with via:"api" (see apiDeployBranch).
  // Only the number of rows is read: not the user, the target or the rest of the metadata.
  const [apiDeploys] = await db
    .select({ n: count() })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.action, "deploy.trigger"),
        like(schema.auditLog.meta, '%"via":"api"%'),
        gte(schema.auditLog.at, start)
      )
    );
  const perDay = await db
    .select({ day, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(day);
  const perWeekday = await db
    .select({ w: weekday, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(weekday);
  const perHour = await db
    .select({ h: hour, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(hour);
  const byState = await db
    .select({ state: schema.deployments.state, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(schema.deployments.state);
  const byEnv = await db
    .select({ env: schema.deployments.env, n: count() })
    .from(schema.deployments)
    .where(inWindow)
    .groupBy(schema.deployments.env);
  const timings = await db
    .select({ startedAt: schema.deployments.startedAt, finishedAt: schema.deployments.finishedAt })
    .from(schema.deployments)
    .where(
      and(
        inWindow,
        inArray(schema.deployments.state, ["ready", "error"]),
        isNotNull(schema.deployments.startedAt),
        isNotNull(schema.deployments.finishedAt)
      )
    );
  const perRuntime = await db
    .select({ runtime: schema.projects.runtime, n: count() })
    .from(schema.projects)
    .groupBy(schema.projects.runtime);
  const perMonitor = await db
    .select({ state: schema.projects.monitorState, n: count() })
    .from(schema.projects)
    .where(inArray(schema.projects.monitorState, ["up", "down"]))
    .groupBy(schema.projects.monitorState);

  const daily = bucketDaily(perDay, now);
  const total = daily.reduce((sum, d) => sum + d.count, 0);
  const stateCount = (s: string) => byState.find((r) => r.state === s)?.n ?? 0;
  const ready = stateCount("ready");
  const failed = stateCount("error");
  const share = successShare(ready, failed);
  const builds = buildTimes(timings.map((t) => (t.finishedAt as Date).getTime() - (t.startedAt as Date).getTime()));
  const weekdays = bucketWeekdays(perWeekday);
  const hours = bucketHours(perHour);
  const up = perMonitor.find((r) => r.state === "up")?.n ?? 0;
  const down = perMonitor.find((r) => r.state === "down")?.n ?? 0;
  const monitored = percentShare(up, down, MIN_CHECKED);
  const growth = growthDirection(newThisWeek.n, newLastWeek.n);

  return {
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    accounts: roundCount(users.n),
    growth: {
      windowDays: GROWTH_DAYS,
      last: roundCount(newThisWeek.n),
      previous: roundCount(newLastWeek.n),
      direction: growth.direction,
      percentChange: growth.percentChange,
      minimumForPercent: MIN_GROWTH_BASE,
    },
    serversConnected: roundCount(servers.n),
    projectsDeployed: roundCount(deployedProjects.n),
    statusPages: roundCount(pages.n),
    domainsMapped: roundCount(domains.n),
    api: {
      tokensActive: roundCount(tokens.n),
      deploymentsViaApi: roundCount(apiDeploys.n),
    },
    deployments: {
      total: roundCount(total),
      daily: daily.map((d) => ({ date: d.date, count: roundDaily(d.count) })),
      outcomes: {
        ready: roundCount(ready),
        error: roundCount(failed),
        canceled: roundCount(stateCount("canceled")),
      },
      byEnvironment: {
        production: roundCount(byEnv.find((r) => r.env === "production")?.n ?? 0),
        preview: roundCount(byEnv.find((r) => r.env === "preview")?.n ?? 0),
      },
      byWeekday: WEEKDAY_NAMES.map((name, i) => ({ weekday: name, count: roundBucket(weekdays[i]) })),
      byHour: {
        minimumBucket: MIN_BUCKET,
        buckets: hours.map((n, h) => ({ hour: h, count: roundBucket(n) })),
      },
    },
    successRate: {
      percent: share.percent,
      finished: roundCount(share.finished),
      minimumFinished: MIN_FINISHED,
    },
    buildTime: {
      finished: roundCount(builds.sample),
      minimumFinished: MIN_BUILDS,
      medianSeconds: builds.medianSeconds,
      p90Seconds: builds.p90Seconds,
    },
    runtimes: schema.RUNTIMES.map((runtime) => ({
      runtime,
      count: roundBucket(perRuntime.find((r) => r.runtime === runtime)?.n ?? 0),
    })),
    monitoring: {
      checked: roundCount(monitored.total),
      minimumChecked: MIN_CHECKED,
      upPercent: monitored.percent,
    },
  };
}
