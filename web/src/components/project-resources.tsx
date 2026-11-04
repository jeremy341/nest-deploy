import { Sparkline } from "@/components/sparkline";
import type { ProjectSamplePoint } from "@/server/queries";

/**
 * What this one project's service used over the last day. The numbers come from
 * systemd's accounting for the service, so they are this project alone and not
 * the whole container. CPU is a share of a single core, so it can pass 100.
 */
export function ProjectResources({ points }: { points: ProjectSamplePoint[] }) {
  const mem = points.filter((p) => p.memMb !== null);
  const cpu = points.filter((p) => p.cpuPercent !== null);
  const memPeak = Math.max(0, ...mem.map((p) => p.memMb as number));
  const cpuPeak = Math.max(0, ...cpu.map((p) => p.cpuPercent as number));
  const latestMem = mem.at(-1)?.memMb ?? null;
  const latestCpu = cpu.at(-1)?.cpuPercent ?? null;

  return (
    <section aria-labelledby="resources-heading" className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="border-b px-4 py-3">
        <h2 id="resources-heading" className="text-title-3">
          Resource use
        </h2>
        <p className="mt-0.5 text-label text-muted-foreground">
          This service only, last 24 hours. Checked every few minutes.
        </p>
      </div>
      {mem.length < 2 && cpu.length < 2 ? (
        <p className="px-4 py-5 text-muted-foreground">
          Collecting data. Readings appear here after a few checks while the app is running.
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-4 p-4 md:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span>Memory</span>
              <span className="tabular font-mono text-[12px] text-muted-foreground">
                {latestMem !== null ? `${latestMem.toFixed(0)} MB now` : "None"}
                {memPeak > 0 ? `, peak ${memPeak.toFixed(0)} MB` : ""}
              </span>
            </div>
            <Sparkline
              points={points.map((p) => ({ at: p.at, value: p.memMb }))}
              max={Math.max(memPeak * 1.15, 1)}
              label={`Memory over the last 24 hours, peak ${memPeak.toFixed(0)} megabytes`}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span>CPU</span>
              <span className="tabular font-mono text-[12px] text-muted-foreground">
                {latestCpu !== null ? `${latestCpu.toFixed(1)}% now` : "None"}
                {cpuPeak > 0 ? `, peak ${cpuPeak.toFixed(1)}%` : ""}
              </span>
            </div>
            <Sparkline
              points={points.map((p) => ({ at: p.at, value: p.cpuPercent }))}
              max={Math.max(cpuPeak * 1.15, 5)}
              label={`CPU over the last 24 hours, peak ${cpuPeak.toFixed(1)} percent of one core`}
            />
          </div>
        </div>
      )}
    </section>
  );
}
