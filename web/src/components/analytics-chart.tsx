"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Day = { day: string; views: number; visitors: number };

const number = new Intl.NumberFormat("en");
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2026-11-04" as "4 Nov". The strings are UTC calendar days. */
function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

function plural(n: number, one: string, many: string): string {
  return `${number.format(n)} ${n === 1 ? one : many}`;
}

/**
 * Daily page views as bars. A day with no views is a short stub, not a gap.
 * The bars grow once when the chart first mounts (a refresh does not replay
 * it). Pointing at a bar puts that day in the caption and dims the others.
 * The role="img" summary carries the same facts for screen readers.
 */
export function AnalyticsChart({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.views));
  const first = daily[0]?.day;
  const last = daily.at(-1)?.day;
  const active = hover !== null ? daily[hover] : null;

  return (
    <figure className="rounded-lg bg-card p-4 shadow-border-small">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-title-3">Page views per day</span>
        <span aria-hidden="true" className="tabular min-w-0 truncate text-right text-caption text-muted-foreground">
          {active
            ? `${formatDay(active.day)}: ${plural(active.views, "view", "views")}, ${plural(active.visitors, "visitor", "visitors")}`
            : `Busiest day: ${number.format(max)}`}
        </span>
      </figcaption>
      <div
        role="img"
        aria-label={`Page views for each of the last ${daily.length} days. The busiest day had ${max}.`}
        className="flex h-32 items-end gap-[3px]"
        onPointerLeave={() => setHover(null)}
      >
        {daily.map((d, i) => {
          const stub = d.views === 0;
          const dim = hover !== null && hover !== i;
          return (
            <div
              key={d.day}
              className="flex h-full min-w-0 flex-1 items-end"
              onPointerEnter={() => setHover(i)}
            >
              <div
                className={cn(
                  "motion-grow-y w-full transition-[opacity,background-color] duration-(--dur-fast)",
                  stub ? "bg-foreground" : hover === i ? "bg-foreground" : "bg-foreground/80"
                )}
                style={{
                  height: `${Math.max((d.views / max) * 100, d.views > 0 ? 3 : 1)}%`,
                  opacity: stub ? 0.2 : dim ? 0.5 : 1,
                  ["--grow-delay" as string]: `${Math.min(i * 8, 240)}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-caption text-muted-foreground">
        <span>{first ? formatDay(first) : null}</span>
        <span>{last ? formatDay(last) : null}</span>
      </div>
    </figure>
  );
}
