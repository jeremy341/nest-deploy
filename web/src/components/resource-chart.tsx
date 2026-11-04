import type { SparkPoint } from "@/components/sparkline";
import { cn } from "@/lib/utils";

const W = 600;
const H = 120;

/**
 * One measurement over time as a line on a fixed 0 to 100% scale, so a flat
 * line near the bottom means plenty of room. Gaps in sampling (more than three
 * times the usual spacing) are drawn as gaps and never smoothed over. With
 * fewer than two readings it says so instead of drawing a flat line.
 *
 * Values are shares of the limit between 0 and 1. It renders on the server and
 * carries a text summary for screen readers.
 */
export function ResourceChart({
  title,
  now,
  detail,
  points,
  rangeLabel,
  className,
}: {
  title: string;
  /** The current reading, for example "0.42 / 2" or "1.2 / 2.0 GB". */
  now: string | null;
  /** A line under the title, for example "2 vCPU". */
  detail?: string;
  points: SparkPoint[];
  /** "24 hours" or "7 days", used for the axis and the accessible name. */
  rangeLabel: string;
  className?: string;
}) {
  const series = points.filter((p): p is { at: number; value: number } => p.value !== null);
  const enough = series.length >= 2;

  const t0 = series[0]?.at ?? 0;
  const span = Math.max((series.at(-1)?.at ?? 0) - t0, 1);
  const gaps = series
    .slice(1)
    .map((p, i) => p.at - series[i].at)
    .sort((a, b) => a - b);
  const maxGap = Math.max((gaps[Math.floor(gaps.length / 2)] ?? 0) * 3, 15 * 60_000);

  const runs: { x: number; y: number }[][] = [[]];
  series.forEach((p, i) => {
    if (i > 0 && p.at - series[i - 1].at > maxGap) runs.push([]);
    runs[runs.length - 1].push({
      x: ((p.at - t0) / span) * W,
      y: H - Math.min(Math.max(p.value, 0), 1) * H,
    });
  });
  const lines = runs.filter((r) => r.length > 1);

  const values = series.map((p) => p.value);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const low = values.length ? Math.min(...values) : 0;
  const peak = values.length ? Math.max(...values) : 0;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <section
      aria-label={title}
      className={cn("overflow-hidden rounded-lg bg-card shadow-border-small", className)}
    >
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-title-3">{title}</h2>
          {detail ? <p className="mt-0.5 text-label text-muted-foreground">{detail}</p> : null}
        </div>
        <p className="tabular shrink-0 font-mono text-[13px]">{now ?? "No reading"}</p>
      </div>

      <div className="px-4 pt-4 pb-3">
        {enough ? (
          <>
            <div className="flex gap-2">
              <div
                aria-hidden="true"
                className="tabular flex h-[120px] shrink-0 flex-col justify-between text-[11px] leading-none text-subtle-foreground"
              >
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${title} over the last ${rangeLabel}: lowest ${pct(low)}, average ${pct(avg)}, peak ${pct(peak)} of the limit.`}
                className="h-[120px] min-w-0 flex-1 text-foreground"
              >
                {[0, 0.5, 1].map((g) => (
                  <line
                    key={g}
                    x1="0"
                    x2={W}
                    y1={Math.min(H - 0.5, Math.max(0.5, H - g * H))}
                    y2={Math.min(H - 0.5, Math.max(0.5, H - g * H))}
                    stroke="currentColor"
                    strokeOpacity={g === 0 ? 0.3 : 0.1}
                    strokeDasharray={g === 0 ? undefined : "3 4"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {lines.map((r, i) => (
                  <g key={i}>
                    <polygon
                      points={`${r[0].x},${H} ${r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} ${r.at(-1)!.x},${H}`}
                      fill="currentColor"
                      fillOpacity="0.07"
                    />
                    <polyline
                      points={r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}
              </svg>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 flex justify-between pl-[34px] text-[11px] text-subtle-foreground"
            >
              <span>{rangeLabel} ago</span>
              <span>now</span>
            </div>
          </>
        ) : (
          <p className="flex h-[120px] items-center justify-center text-center text-muted-foreground">
            Collecting data. The worker takes a reading every five minutes.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 divide-x border-t text-center">
        {[
          ["Lowest", enough ? pct(low) : "None"],
          ["Average", enough ? pct(avg) : "None"],
          ["Peak", enough ? pct(peak) : "None"],
        ].map(([k, v]) => (
          <div key={k} className="px-2 py-2.5">
            <dt className="text-[11px] text-subtle-foreground">{k}</dt>
            <dd className="tabular mt-0.5 font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
