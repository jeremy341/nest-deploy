import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { audit } from "@/server/audit";
import { prunePageviews } from "@/server/analytics";
import { getDb, schema } from "@/server/db";
import { unitName } from "@/server/deploy/layout";
import { serviceStatus } from "@/server/deploy/remote";
import { openAlert, pruneAlertEvents, resolveAlert } from "@/server/notify";
import { withServerSession } from "@/server/servers";
import { parseServiceStatus, type ServiceStatus } from "@/server/service-status";
import { probeSession } from "@/server/ssh/probe";

/**
 * Uptime checks and usage history, run by the worker on a timer.
 *
 * One SSH session per server covers every project on it. An outage is only
 * announced after a number of failed checks in a row (two unless the project
 * says otherwise), and the recovery is announced once, so a webhook channel is
 * not spammed by one slow answer. Resource warnings fire once when a value
 * reaches its limit and once more when it drops back below.
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

/**
 * Running, and answering on its health path with anything below a server
 * error. With a response time limit, an answer slower than the limit counts
 * as a failed check too.
 */
export function isHealthy(s: ServiceStatus, slowMs: number | null = null): boolean {
  if (s.state !== "running") return false;
  if (s.http === null) return true; // no curl on the container: systemd's word is all we have
  if (!(s.http.code > 0 && s.http.code < 500)) return false;
  return !isSlow(s, slowMs);
}

/** Answered, but later than the limit. False when there is no limit or no timing. */
export function isSlow(s: ServiceStatus, slowMs: number | null): boolean {
  return slowMs !== null && s.http !== null && s.http.ms !== null && s.http.ms > slowMs;
}

// ------------------------------------------------------------ resource limits

export type ResourceKind = "disk" | "memory" | "cpu";

export type ResourceUsage = {
  cpuLoad: number | null;
  cpus: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  diskUsedMb: number | null;
  diskTotalMb: number | null;
};

export type ResourceLimits = { diskPct: number; memoryPct: number; cpuPct: number };

export type Reading = {
  kind: ResourceKind;
  /** Whole percent, rounded down so 89.9 never reads as 90. */
  percent: number;
  limit: number;
  over: boolean;
};

const share = (used: number | null, total: number | null) =>
  used !== null && total !== null && total > 0 ? (used / total) * 100 : null;

/**
 * Pure: how full each resource is, set against a project's limits. A figure
 * the probe could not read is left out, which says nothing either way.
 * CPU is the 1 minute load average as a share of the cores.
 */
export function readResources(u: ResourceUsage, limits: ResourceLimits): Reading[] {
  const raw: [ResourceKind, number | null, number][] = [
    ["disk", share(u.diskUsedMb, u.diskTotalMb), limits.diskPct],
    ["memory", share(u.memUsedMb, u.memTotalMb), limits.memoryPct],
    ["cpu", share(u.cpuLoad, u.cpus), limits.cpuPct],
  ];
  const out: Reading[] = [];
  for (const [kind, value, limit] of raw) {
    if (value === null || !Number.isFinite(value)) continue;
    out.push({ kind, percent: Math.floor(value), limit, over: value >= limit });
  }
  return out;
}

/**
 * Pure: what to do given the readings and which resources already have an
 * open alert. Fire once when a value reaches its limit, say so once when it
 * drops back below, and stay quiet in between.
 */
export function planResourceAlerts(
  readings: Reading[],
  open: ReadonlySet<ResourceKind>
): { fire: Reading[]; resolve: Reading[] } {
  return {
    fire: readings.filter((r) => r.over && !open.has(r.kind)),
    resolve: readings.filter((r) => !r.over && open.has(r.kind)),
  };
}

const RESOURCE_NAME: Record<ResourceKind, string> = {
  disk: "Disk",
  memory: "Memory",
  cpu: "CPU load",
};

export function resourceMessage(r: Reading, phase: "fire" | "resolve"): string {
  const name = RESOURCE_NAME[r.kind];
  return phase === "fire"
    ? `${name} on the server reached ${r.percent}% (your limit is ${r.limit}%).`
    : `${name} on the server is back below ${r.limit}% (now ${r.percent}%).`;
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
  healthy: boolean,
  failuresBeforeDown = FAILURES_BEFORE_DOWN
): Transition {
  if (healthy) {
    return { state: "up", failures: 0, change: prev.state === "down" ? "up" : null };
  }
  const failures = prev.failures + 1;
  if (failures >= failuresBeforeDown) {
    return { state: "down", failures, change: prev.state === "down" ? null : "down" };
  }
  return { state: prev.state, failures, change: null };
}

function describe(s: ServiceStatus, slowMs: number | null = null): string {
  if (s.state !== "running") return `The service is ${s.state.replace("_", " ")}.`;
  if (s.http && s.http.code > 0 && s.http.code < 500 && isSlow(s, slowMs)) {
    return `The health path took ${s.http.ms} ms to answer, over your limit of ${slowMs} ms.`;
  }
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

  const usage: ResourceUsage = {
    cpuLoad: probe.load1,
    cpus: probe.cpus,
    memUsedMb: probe.memUsedMb,
    memTotalMb: probe.memTotalMb,
    diskUsedMb: probe.diskUsedMb,
    diskTotalMb: probe.diskTotalMb,
  };

  for (const p of projects) {
    await checkResources(p, usage, now);
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
      isHealthy(status, p.alertSlowMs),
      p.alertFailures
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
      const detail =
        next.change === "down" ? describe(status, p.alertSlowMs) : "It is answering again.";
      await audit(p.userId, next.change === "down" ? "monitor.down" : "monitor.up", p.id, { detail });
      if (next.change === "down") await openAlert(p, "down", detail, now);
      else await resolveAlert(p, "down", detail, now);
    }
  }
}

/** Compare the server's usage with one project's limits and fire or clear alerts. */
async function checkResources(p: ProjectRow, usage: ResourceUsage, now: Date) {
  const db = await getDb();
  const readings = readResources(usage, {
    diskPct: p.alertDiskPct,
    memoryPct: p.alertMemPct,
    cpuPct: p.alertCpuPct,
  });
  const openRows = await db
    .select({ type: schema.alertEvents.type })
    .from(schema.alertEvents)
    .where(
      and(
        eq(schema.alertEvents.projectId, p.id),
        inArray(schema.alertEvents.type, ["disk", "memory", "cpu"]),
        isNull(schema.alertEvents.resolvedAt)
      )
    );
  const open = new Set(openRows.map((r) => r.type as ResourceKind));
  const plan = planResourceAlerts(readings, open);
  for (const r of plan.fire) await openAlert(p, r.kind, resourceMessage(r, "fire"), now);
  for (const r of plan.resolve) await resolveAlert(p, r.kind, resourceMessage(r, "resolve"), now);
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
  await pruneAlertEvents(now);
}
