/**
 * Runs once when the Next.js server starts. With RUN_WORKER=1 the website
 * also works through the deployment queue, so one process is enough to host
 * everything. Set RUN_WORKER=0 and use `pnpm worker` to run builds elsewhere.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER !== "1") return;

  const g = globalThis as unknown as { __nestDeployWorker?: unknown };
  if (g.__nestDeployWorker) return;

  const { startWorker } = await import("@/server/jobs");
  const { config } = await import("@/server/config");
  if (config().BUILD_RUNNER === "local") {
    console.warn(
      "WARNING: BUILD_RUNNER=local runs project builds on this machine with no isolation."
    );
  }
  g.__nestDeployWorker = startWorker({
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    onError: (err) => console.error("worker error", err),
  });
}
