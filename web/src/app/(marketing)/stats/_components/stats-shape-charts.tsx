"use client";

import { useState } from "react";
import { countValue, describeCount, formatCount, formatHour, type Count } from "@/lib/stats-format";
import { cn } from "@/lib/utils";
import { TableDisclosure } from "./figures";
import { PLOT_H } from "./layout";

/** Height of the outlined stub that stands for "fewer than 10". Not to scale on purpose. */
const STUB = 12;

type Weekday = { weekday: string; count: Count };
type Hour = { hour: number; count: Count };

/** Mark kinds are drawn differently so nothing is implied that is not known. */
function Legend({ children }: { children: React.ReactNode }) {
  return (
    <ul aria-label="How to read the chart" className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-muted-foreground">
      {children}
    </ul>
  );
}

/**
 * Deployments per weekday (UTC) over the last 30 days: seven bars from zero,
 * every one to the same scale and labelled with its rounded value. A weekday
 * with fewer than 10 is an outlined stub with no number and no height to
 * scale. The table under the chart carries the same facts.
 */
export function WeekdayChart({ buckets, windowDays }: { buckets: Weekday[]; windowDays: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = buckets.map((b) => countValue(b.count));
  const max = Math.max(0, ...values);
  const few = buckets.filter((b) => "lessThan" in b.count).length;
  const active = hover !== null ? buckets[hover] : null;
  const busiest = max >= 10 ? buckets.find((b) => countValue(b.count) === max) : undefined;

  const summary =
    `Deployments for each weekday over the last ${windowDays} days, in UTC, Monday first. ` +
    (busiest ? `${busiest.weekday} was the busiest with ${describeCount(busiest.count)}. ` : "No weekday reached 10. ") +
    `${few} ${few === 1 ? "weekday" : "weekdays"} had fewer than 10.`;

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-label font-medium">Deployments by weekday</span>
        <span aria-hidden="true" className="tabular text-right text-caption text-muted-foreground">
          {active
            ? `${active.weekday}: ${describeCount(active.count)}`
            : busiest
              ? `Busiest: ${busiest.weekday}`
              : "No weekday reached 10"}
        </span>
      </figcaption>

      <div className="mt-3">
        <div
          role="img"
          aria-label={summary}
          className={cn("grid grid-cols-7 gap-2 border-b sm:gap-3", PLOT_H)}
          onPointerLeave={() => setHover(null)}
        >
          {buckets.map((b, i) => {
            const few = "lessThan" in b.count;
            const v = countValue(b.count);
            const isActive = hover === i;
            const dim = hover !== null && !isActive;
            // Bars use 80% of the plot at most, so the label above the tallest one is never clipped.
            const height = few ? `${STUB}%` : `${Math.max((v / max) * 80, 4)}%`;
            return (
              <div
                key={b.weekday}
                className="flex h-full min-w-0 flex-col items-stretch justify-end"
                onPointerEnter={() => setHover(i)}
              >
                <span className="tabular mb-1 block h-4 truncate text-center text-caption text-muted-foreground">
                  {few ? "" : formatCount(b.count)}
                </span>
                <div
                  className={cn(
                    "motion-grow-y w-full transition-[opacity,background-color,border-color] duration-(--dur-fast)",
                    few ? (isActive ? "border border-brand" : "border border-foreground") : isActive ? "bg-brand" : "bg-foreground"
                  )}
                  style={{
                    height,
                    opacity: dim ? 0.45 : 1,
                    ["--grow-delay" as string]: `${i * 30}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" className="mt-2 grid grid-cols-7 gap-2 text-center text-caption text-muted-foreground sm:gap-3">
          {buckets.map((b) => (
            <span key={b.weekday}>{b.weekday.slice(0, 3)}</span>
          ))}
        </div>
      </div>

      <Legend>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 bg-foreground" />
          10 or more, rounded, from zero
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 border border-foreground" />
          Fewer than 10 (height not to scale)
        </li>
      </Legend>

      <TableDisclosure
        caption={`Deployments per weekday in UTC over the last ${windowDays} days, rounded`}
        head={["Weekday (UTC)", "Deployments"]}
        rows={buckets.map((b) => [b.weekday, formatCount(b.count)])}
      />
    </figure>
  );
}

/** Opacity of the lightest cell that carries a value, so a small value is still visible. */
const FLOOR = 0.25;

/**
 * Deployments per hour of the day (UTC) over the last 30 days: 24 cells.
 * Darker means more, on a scale from 10 to the busiest hour. An hour with
 * fewer than `minimumBucket` is an empty outlined cell with no value: it is
 * neither dark nor light, and it is never a zero. The table under the strip
 * carries the same facts.
 */
export function HourStrip({
  buckets,
  minimumBucket,
  windowDays,
}: {
  buckets: Hour[];
  minimumBucket: number;
  windowDays: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = buckets.map((b) => countValue(b.count));
  const max = Math.max(0, ...values);
  const shown = buckets.filter((b) => "approx" in b.count).length;
  const active = hover !== null ? buckets[hover] : null;
  const busiest = max >= minimumBucket ? buckets.find((b) => countValue(b.count) === max) : undefined;

  const summary =
    `Deployments for each hour of the day over the last ${windowDays} days, in UTC. ` +
    (shown === 0
      ? `No hour reached ${minimumBucket}, so no values are shown.`
      : `${shown} of 24 hours had ${minimumBucket} or more. ${
          busiest ? `The busiest started at ${formatHour(busiest.hour)} with ${describeCount(busiest.count)}. ` : ""
        }The other ${24 - shown} had fewer than ${minimumBucket}.`);

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-label font-medium">Deployments by hour of day (UTC)</span>
        <span aria-hidden="true" className="tabular text-right text-caption text-muted-foreground">
          {active
            ? `${formatHour(active.hour)}: ${describeCount(active.count)}`
            : busiest
              ? `Busiest: ${formatHour(busiest.hour)}`
              : `No hour reached ${minimumBucket}`}
        </span>
      </figcaption>

      <div className="mt-3">
        <div
          role="img"
          aria-label={summary}
          className="grid h-12 grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]"
          onPointerLeave={() => setHover(null)}
        >
          {buckets.map((b, i) => {
            const isActive = hover === i;
            const low = "lessThan" in b.count;
            return (
              <div
                key={b.hour}
                onPointerEnter={() => setHover(i)}
                className={cn(
                  "transition-[outline-color] duration-(--dur-fast)",
                  low ? "border border-dashed border-foreground/50" : "bg-foreground",
                  isActive && "outline-2 outline-offset-1 outline-brand"
                )}
                style={low ? undefined : { opacity: FLOOR + (1 - FLOOR) * (countValue(b.count) / max) }}
              />
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="mt-2 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] text-caption whitespace-nowrap text-muted-foreground"
        >
          {[0, 6, 12, 18].map((h) => (
            <span key={h} style={{ gridColumnStart: h + 1 }}>
              {formatHour(h)}
            </span>
          ))}
        </div>
      </div>

      <Legend>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-14 shrink-0"
            style={{
              background: `linear-gradient(to right, color-mix(in oklab, var(--foreground) ${FLOOR * 100}%, transparent), var(--foreground))`,
            }}
          />
          {minimumBucket} to {busiest ? describeCount(busiest.count) : "the busiest hour"}, rounded
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 border border-dashed border-foreground/50" />
          Fewer than {minimumBucket}, no value shown
        </li>
      </Legend>

      <TableDisclosure
        caption={`Deployments per hour of the day in UTC over the last ${windowDays} days, rounded`}
        head={["Hour starting (UTC)", "Deployments"]}
        rows={buckets.map((b) => [formatHour(b.hour), formatCount(b.count)])}
      />
    </figure>
  );
}
