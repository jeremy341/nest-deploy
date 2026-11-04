const W = 240;
const H = 28;

export type SparkPoint = { at: number; value: number | null };

/**
 * A small line of one measurement over time, drawn on the server.
 *
 * The scale runs from 0 to `max`, so a flat line low down means plenty of room
 * and a line near the top means little. Gaps in sampling (more than three
 * times the usual spacing) are drawn as gaps, never smoothed over, and a
 * metric with fewer than two readings draws nothing at all.
 */
export function Sparkline({
  points,
  max,
  label,
  className = "mt-2",
}: {
  points: SparkPoint[];
  max: number;
  label: string;
  className?: string;
}) {
  const series = points.filter((p): p is { at: number; value: number } => p.value !== null);
  if (series.length < 2 || max <= 0) return null;

  const t0 = series[0].at;
  const span = Math.max(series[series.length - 1].at - t0, 1);
  const gaps = series
    .slice(1)
    .map((p, i) => p.at - series[i].at)
    .sort((a, b) => a - b);
  const maxGap = Math.max(gaps[Math.floor(gaps.length / 2)] * 3, 15 * 60_000);

  const runs: string[][] = [[]];
  series.forEach((p, i) => {
    if (i > 0 && p.at - series[i - 1].at > maxGap) runs.push([]);
    const x = ((p.at - t0) / span) * W;
    const y = H - 1 - Math.min(p.value / max, 1) * (H - 2);
    runs[runs.length - 1].push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`${className} h-7 w-full text-muted-foreground`}
    >
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="currentColor" strokeOpacity="0.25" />
      {runs
        .filter((r) => r.length > 1)
        .map((r, i) => (
          <polyline
            key={i}
            points={r.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}
