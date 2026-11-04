import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { runMonitorPass } from "@/server/monitor";
import {
  defaultDeps,
  runDeployJob,
  runRollbackJob,
  type PipelineDeps,
} from "@/server/deploy/pipeline";

export type Job = typeof schema.jobs.$inferSelect;

/** How long a job may stay "running" before it is presumed dead. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Claim the oldest queued job whose project has nothing else running.
 * Claiming is a conditional UPDATE, so two workers can never take one job.
 */
export async function claimNextJob(workerId: string): Promise<Job | null> {
  const db = await getDb();
  const candidates = await db
    .select({ job: schema.jobs, projectId: schema.deployments.projectId })
    .from(schema.jobs)
    .innerJoin(schema.deployments, eq(schema.deployments.id, schema.jobs.deploymentId))
    .where(eq(schema.jobs.state, "queued"))
    .orderBy(asc(schema.jobs.createdAt))
    .limit(25);

  for (const { job, projectId } of candidates) {
    const busy = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.deployments, eq(schema.deployments.id, schema.jobs.deploymentId))
      .where(and(eq(schema.jobs.state, "running"), eq(schema.deployments.projectId, projectId)))
      .get();
    if (busy) continue;

    const claimed = await db
      .update(schema.jobs)
      .set({
        state: "running",
        lockedBy: workerId,
        lockedAt: new Date(),
        attempts: sql`${schema.jobs.attempts} + 1`,
      })
      .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.state, "queued")))
      .returning();
    if (claimed.length === 1) return claimed[0];
  }
  return null;
}

/** Fail jobs whose worker vanished, and tell the user what happened. */
export async function recoverStaleJobs(now = new Date()): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const stale = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.state, "running"), lt(schema.jobs.lockedAt, cutoff)));

  for (const job of stale) {
    await db
      .update(schema.jobs)
      .set({ state: "failed", error: "Worker stopped during this job" })
      .where(eq(schema.jobs.id, job.id));
    await db
      .update(schema.deployments)
      .set({
        state: "error",
        error: "The worker stopped while this deployment was running. Try again.",
        finishedAt: now,
      })
      .where(
        and(
          eq(schema.deployments.id, job.deploymentId),
          inArray(schema.deployments.state, ["building", "deploying", "queued"])
        )
      );
  }
  return stale.length;
}

/** At startup, anything this worker id left running is dead by definition. */
export async function failOrphanedJobs(workerId: string): Promise<number> {
  const db = await getDb();
  const orphans = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.state, "running"), eq(schema.jobs.lockedBy, workerId)));
  for (const job of orphans) {
    await db
      .update(schema.jobs)
      .set({ state: "failed", error: "Worker restarted during this job" })
      .where(eq(schema.jobs.id, job.id));
    await db
      .update(schema.deployments)
      .set({
        state: "error",
        error: "The worker restarted while this deployment was running. Try again.",
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(schema.deployments.id, job.deploymentId),
          inArray(schema.deployments.state, ["building", "deploying"])
        )
      );
  }
  return orphans.length;
}

/** Run one claimed job to completion, honouring cancellation. */
export async function processJob(job: Job, deps: PipelineDeps = defaultDeps()) {
  const db = await getDb();
  const abort = new AbortController();

  // Cancellation is a state change in the database; poll for it.
  const watcher = setInterval(async () => {
    try {
      const d = await db
        .select({ state: schema.deployments.state })
        .from(schema.deployments)
        .where(eq(schema.deployments.id, job.deploymentId))
        .get();
      if (d?.state === "canceled") abort.abort();
    } catch {
      /* the next tick retries */
    }
  }, 2000);

  try {
    if (job.type === "rollback") await runRollbackJob(job.deploymentId, deps);
    else await runDeployJob(job.deploymentId, deps, abort.signal);
    await db.update(schema.jobs).set({ state: "done" }).where(eq(schema.jobs.id, job.id));
  } catch (err) {
    await db
      .update(schema.jobs)
      .set({ state: "failed", error: String((err as Error)?.message ?? err).slice(0, 500) })
      .where(eq(schema.jobs.id, job.id));
  } finally {
    clearInterval(watcher);
  }
}

export type WorkerHandle = { stop: () => Promise<void>; workerId: string };

/** Poll for jobs until stopped. Used by `pnpm worker` and the embedded worker. */
export function startWorker(options: {
  concurrency?: number;
  pollMs?: number;
  /** How often to check uptime and sample usage. 0 turns the monitor off. */
  monitorMs?: number;
  deps?: PipelineDeps;
  workerId?: string;
  onError?: (err: unknown) => void;
} = {}): WorkerHandle {
  const workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const concurrency = options.concurrency ?? 2;
  const pollMs = options.pollMs ?? 1000;
  let running = 0;
  let stopped = false;
  const inFlight = new Set<Promise<void>>();

  const tick = async () => {
    if (stopped) return;
    try {
      while (running < concurrency && !stopped) {
        const job = await claimNextJob(workerId);
        if (!job) break;
        running++;
        const p = processJob(job, options.deps).finally(() => {
          running--;
          inFlight.delete(p);
        });
        inFlight.add(p);
      }
    } catch (err) {
      options.onError?.(err);
    }
  };

  void (async () => {
    try {
      await failOrphanedJobs(workerId);
      await recoverStaleJobs();
    } catch (err) {
      options.onError?.(err);
    }
  })();

  const interval = setInterval(() => void tick(), pollMs);
  void tick();
  const staleTimer = setInterval(() => void recoverStaleJobs().catch(options.onError), 5 * 60_000);

  const monitorMs = options.monitorMs ?? Number(process.env.MONITOR_INTERVAL_MS ?? 5 * 60_000);
  let monitoring = false;
  const monitorTimer =
    monitorMs > 0
      ? setInterval(() => {
          if (monitoring || stopped) return;
          monitoring = true;
          void runMonitorPass(options.onError)
            .catch(options.onError)
            .finally(() => {
              monitoring = false;
            });
        }, monitorMs)
      : null;

  return {
    workerId,
    stop: async () => {
      stopped = true;
      clearInterval(interval);
      clearInterval(staleTimer);
      if (monitorTimer) clearInterval(monitorTimer);
      await Promise.allSettled([...inFlight]);
    },
  };
}
