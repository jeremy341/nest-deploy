import { and, eq, gte, inArray } from "drizzle-orm";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { randomToken } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { getProjectForUser } from "@/server/projects";

/**
 * A public page that says whether a project is answering. It shows the name,
 * the current state from the worker's checks, and recent outages, and nothing
 * else: no repository, port, server or commit. The address is an unguessable
 * key, and the owner can switch it off at any time.
 */

export function statusUrl(key: string) {
  return `${config().APP_URL.replace(/\/$/, "")}/status/${key}`;
}

export async function enableStatusPage(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  if (project.statusKey) return { key: project.statusKey, url: statusUrl(project.statusKey) };
  const key = randomToken(9);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ statusKey: key, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await audit(userId, "status.enable", project.id);
  return { key, url: statusUrl(key) };
}

export async function disableStatusPage(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ statusKey: null, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await audit(userId, "status.disable", project.id);
}

export type Incident = { from: Date; to: Date | null };

/** Turn the down and up events, oldest first, into outages. Pure, so it is easy to test. */
export function incidentsFrom(events: { action: string; at: Date }[]): Incident[] {
  const out: Incident[] = [];
  let open: Incident | null = null;
  for (const e of events) {
    if (e.action === "monitor.down" && !open) {
      open = { from: e.at, to: null };
      out.push(open);
    } else if (e.action === "monitor.up" && open) {
      open.to = e.at;
      open = null;
    }
  }
  return out;
}

/** Share of the window the project was answering, from the recorded outages. */
export function uptimePercent(incidents: Incident[], windowStart: Date, now: Date): number {
  const total = now.getTime() - windowStart.getTime();
  if (total <= 0) return 100;
  let down = 0;
  for (const i of incidents) {
    const from = Math.max(i.from.getTime(), windowStart.getTime());
    const to = Math.min((i.to ?? now).getTime(), now.getTime());
    if (to > from) down += to - from;
  }
  return Math.max(0, Math.min(100, (1 - down / total) * 100));
}

/** One day in the strip. `none` means no checks had run yet on that day. */
export type StripDay = {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  state: "up" | "partial" | "down" | "none";
  /** Whole minutes the app was not answering that day. */
  downMinutes: number;
};

const DAY_MS = 86_400_000;

/**
 * One entry per UTC day, oldest first, ending with today. A day is `partial`
 * when the app was down for part of it, and `down` when it was down for more
 * than half. Pure, so it is easy to test.
 */
export function dailyStrip(incidents: Incident[], now: Date, days = 30, hasData = true): StripDay[] {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: StripDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = todayStart - i * DAY_MS;
    const end = Math.min(start + DAY_MS, now.getTime());
    const day = new Date(start).toISOString().slice(0, 10);
    if (!hasData) {
      out.push({ day, state: "none", downMinutes: 0 });
      continue;
    }
    let down = 0;
    for (const inc of incidents) {
      const from = Math.max(inc.from.getTime(), start);
      const to = Math.min((inc.to ?? now).getTime(), end);
      if (to > from) down += to - from;
    }
    const state = down === 0 ? "up" : down * 2 > end - start ? "down" : "partial";
    out.push({ day, state, downMinutes: Math.round(down / 60_000) });
  }
  return out;
}

export type PublicStatus = {
  name: string;
  state: "up" | "down" | "unknown";
  since: Date | null;
  uptime: number | null;
  windowDays: number;
  incidents: Incident[];
  days: StripDay[];
};

export async function publicStatus(key: string, now = new Date()): Promise<PublicStatus | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const db = await getDb();
  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.statusKey, key))
    .get();
  if (!project) return null;

  const windowDays = 30;
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
  const events = await db
    .select({ action: schema.auditLog.action, at: schema.auditLog.at })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.target, project.id),
        inArray(schema.auditLog.action, ["monitor.down", "monitor.up"]),
        // Start a little early so an outage that began before the window still pairs up.
        gte(schema.auditLog.at, new Date(windowStart.getTime() - 7 * 86_400_000))
      )
    )
    .orderBy(schema.auditLog.at, schema.auditLog.id);
  const incidents = incidentsFrom(events).filter((i) => (i.to ?? now) >= windowStart);

  // Without checks there is nothing honest to say about uptime.
  const hasData = project.monitorState !== "unknown";
  return {
    name: project.name,
    state: project.monitorState,
    since: project.monitorSince,
    uptime: hasData ? uptimePercent(incidents, windowStart, now) : null,
    windowDays,
    incidents: incidents.slice(-10).reverse(),
    days: dailyStrip(incidents, now, windowDays, hasData),
  };
}
