// Standalone worker: `pnpm worker`. Runs queued deployments until stopped.
// The web app can also run a worker in-process (RUN_WORKER=1), so this file
// exists for running builds on a different machine than the website.
import { config } from "../src/server/config";
import { startWorker } from "../src/server/jobs";

const c = config();
if (c.BUILD_RUNNER === "local") {
  console.warn(
    "WARNING: BUILD_RUNNER=local runs project builds on this machine with no isolation. Use docker for anything other than your own projects."
  );
}

const worker = startWorker({
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  onError: (err) => console.error("worker error", err),
});
console.log(`Worker ${worker.workerId} started (builds: ${c.BUILD_RUNNER})`);

const shutdown = async (signal: string) => {
  console.log(`${signal} received, finishing running jobs...`);
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
