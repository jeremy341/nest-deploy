import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { audit } from "@/server/audit";
import { prunePageviews } from "@/server/analytics";
import { getDb, schema } from "@/server/db";
import { unitName } from "@/server/deploy/layout";
import { serviceStatus } from "@/server/deploy/remote";
import { notifyProjectStatus } from "@/server/notify";
import { withServerSession } from "@/server/servers";
import { parseServiceStatus, type ServiceStatus } from "@/server/service-status";
import { probeSession } from "@/server/ssh/probe";

/**
 * Uptime checks and usage history, run by the worker on a timer.
 *
 * One SSH session per server covers every project on it. An outage is only
 * announced after a second failed check in a row, and the recovery is
 * announced once, so a webhook channel is not spammed by one slow answer.
 */

export const FAILURES_BEFORE_DOWN = 2;
/** How long usage samples are kept. */
export const SAMPLE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

type MonitorState = "unknown" | "up" | "down";

/**
 * Share of one CPU core the service used between two samples, in percent.
 * Returns null when it cannot be worked out honestly: no earlier sample, a
 * gap too long to be meaningful, or the counter went backwards (a restart).
 */
export function cpuPercentBetween(
  prev: { at: Date; cpuNs: number | null } | undefined,
  cur: { at: Date; cpuNs: number | null },
  maxGapMs = 30 * 60_000
): number | null {
  if (!prev || prev.cpuNs === null || cur.cpuNs === null) return null;
  const elapsed = cur.at.getTime() - prev.at.getTime();
  if (elapsed <= 0 || elapsed > maxGapMs || cur.cpuNs < prev.cpuNs) return null;
  return Math.round(((cur.cpuNs - prev.cpuNs) / 1e6 / elapsed) * 1000) / 10;
}

/** Running, and answering on its health path with anything below a server error. */
export function isHealthy(s: ServiceStatus): boolean {
  if (s.state !== "running") return false;
  if (s.http === null) return true; // no curl on the container: systemd's word is all we have
  return s.http.code > 0 && s.http.code < 500;
}

export type Transition = {
  state: MonitorState;
  failures: number;
  /** Set only when the state flipped and someone should be told. */
  change: "down" | "up" | null;
};

/** Pure: the next monitor state given the last one and this check's result. */
export function nextMonitorState(
  prev: { state: MonitorState; failures: number },
  healthy: boolean
): Transition {
  if (healthy) {
    return { state: "up", failures: 0, change: prev.state === "down" ? "up" : null };
  }
  const failures = prev.failures + 1;
  if (failures >= FAILURES_BEFORE_DOWN) {
    return { state: "down", failures, change: prev.state === "down" ? null : "down" };
  }
  return { state: prev.state, failures, change: null };
}

function describe(s: ServiceStatus): string {
  if (s.state !== "running") return `The service is ${s.state.replace("_", " ")}.`;
  if (s.http && s.http.code === 0) return "The service is running but nothing answered on its health path.";
  if (s.http) return `The health path answered HTTP ${s.http.code}.`;
  return "The service did not pass its check.";
}

type ProjectRow = typeof schema.projects.$inferSelect;

/** Projects with a live production release and nothing being deployed right now. */
async function checkable(serverId: string): Promise<ProjectRow[]> {
  const db = await getDb();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.serverId, serverId));
  const out: ProjectRow[] = [];
  for (const p of projects) {
    const live = await db
      .select({ id: schema.deployments.id })
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.projectId, p.id),
          eq(schema.deployments.env, "production"),
          eq(schema.deployments.isCurrent, true)
        )
      )
      .get();
    if (!live) continue;
    const busy = await db
      .select({ id: schema.deployments.id })
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.projectId, p.id),
          inArray(schema.deployments.state, ["queued", "building", "deploying"])
        )
      )
      .get();
    if (!busy) out.push(p);
  }
  return out;
}

async function checkServer(server: typeof schema.servers.$inferSelect, now: Date) {
  const db = await getDb();
  const projects = await checkable(server.id);

  const { probe, results } = await withServerSession(server, async (s) => {
    const probe = await probeSession(s);
    const results = new Map<string, ServiceStatus>();
    for (const p of projects) {
      const r = await s.script(
        serviceStatus({ unit: unitName(p.slug), port: p.port, path: p.healthPath }),
        { timeoutMs: 20_000 }
      );
      if (r.code === 0) results.set(p.id, parseServiceStatus(r.stdout, now));
    }
    return { probe, results };
  });

  await db.insert(schema.usageSamples).values({
    serverId: server.id,
    at: now,
    cpuLoad: probe.load1,
    cpus: probe.cpus,
    memUsedMb: probe.memUsedMb,
    memTotalMb: probe.memTotalMb,
    diskUsedMb: probe.diskUsedMb,
    diskTotalMb: probe.diskTotalMb,
  });

  for (const p of projects) {
    const status = results.get(p.id);
    if (!status) continue; // could not read it; that says nothing about the app
    if (status.state === "running") {
      const prev = await db
        .select({ at: schema.projectSamples.at, cpuNs: schema.projectSamples.cpuNs })
        .from(schema.projectSamples)
        .where(eq(schema.projectSamples.projectId, p.id))
        .orderBy(desc(schema.projectSamples.at))
        .limit(1)
        .get();
      await db.insert(schema.projectSamples).values({
        projectId: p.id,
        at: now,
        memMb: status.memoryMb,
        cpuNs: status.cpuNs,
        cpuPercent: cpuPercentBetween(prev, { at: now, cpuNs: status.cpuNs }),
        restarts: status.restarts,
      });
    }
    const next = nextMonitorState(
      { state: p.monitorState, failures: p.monitorFailures },
      isHealthy(status)
    );
    await db
      .update(schema.projects)
      .set({
        monitorState: next.state,
        monitorFailures: next.failures,
        ...(next.change ? { monitorSince: now } : {}),
      })
      .where(eq(schema.projects.id, p.id));
    if (next.change) {
      const detail = next.change === "down" ? describe(status) : "It is answering again.";
      await audit(p.userId, next.change === "down" ? "monitor.down" : "monitor.up", p.id, { detail });
      await notifyProjectStatus(p, next.change, detail);
    }
  }
}

/** Check every connected server once. A server that cannot be reached is skipped. */
export async function runMonitorPass(onError?: (err: unknown) => void, now = new Date()) {
  const db = await getDb();
  const servers = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.status, "connected"));
  for (const server of servers) {
    try {
      await checkServer(server, now);
    } catch (err) {
      onError?.(err);
    }
  }
  const cutoff = new Date(now.getTime() - SAMPLE_KEEP_MS);
  await db.delete(schema.usageSamples).where(lt(schema.usageSamples.at, cutoff));
  await db.delete(schema.projectSamples).where(lt(schema.projectSamples.at, cutoff));
  await prunePageviews(now);
}
