"use client";

import { useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";
import { describeCount, formatCount, formatDay, type Count } from "@/lib/stats-format";
import { cn } from "@/lib/utils";
import { PLOT_H } from "./layout";

type Day = { date: string; count: Count };

/** Height of the outlined stub that stands for "1 to 9 that day". Not to scale on purpose. */
const STUB = 14;

/**
 * Total deployments per UTC day, as bars. Three kinds of day are drawn
 * differently so nothing is implied that is not known:
 *  - a solid bar for a day with 10 or more, to scale and rounded;
 *  - an outlined stub for a day with 1 to 9 ("fewer than 10", not to scale);
 *  - a flat line for a day with none (a real zero, not a missing day).
 * Bars grow once on first mount. Pointing at a day puts it in the caption; the
 * role="img" summary and the table under the chart carry the same facts for
 * screen readers and keyboards.
 */
export function StatsChart({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = daily.map((d) => ("approx" in d.count ? d.count.approx : 0));
  const max = Math.max(0, ...values);
  const scaleMax = max >= 10 ? max : 10;
  const first = daily[0]?.date;
  const last = daily.at(-1)?.date;
  const active = hover !== null ? daily[hover] : null;
  const quiet = daily.filter((d) => "approx" in d.count && d.count.approx === 0).length;
  const few = daily.filter((d) => "lessThan" in d.count).length;

  const summary =
    `Total deployments for each of the last ${daily.length} days, in UTC. ` +
    (max >= 10 ? `The busiest day had ${describeCount({ approx: max })}. ` : "No day reached 10. ") +
    `${few} ${few === 1 ? "day" : "days"} had fewer than 10 and ${quiet} had none.`;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-label font-medium">Deployments per day</span>
        <span aria-hidden="true" className="tabular min-w-0 truncate text-right text-caption text-muted-foreground">
          {active
            ? `${formatDay(active.date)}: ${describeCount(active.count)}`
            : max >= 10
              ? `Busiest day: ${describeCount({ approx: max })}`
              : "No day reached 10"}
        </span>
      </figcaption>

      <div className="mt-3 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
        <div
          aria-hidden="true"
          className={cn("tabular flex flex-col justify-between text-right text-caption text-muted-foreground", PLOT_H)}
        >
          <span className="-mt-1">{formatCount({ approx: scaleMax })}</span>
          <span className="-mb-1">0</span>
        </div>
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed" />
          <div
            role="img"
            aria-label={summary}
            className={cn("relative flex items-end gap-[2px] border-b sm:gap-[3px]", PLOT_H)}
            onPointerLeave={() => setHover(null)}
          >
            {daily.map((d, i) => {
              const isActive = hover === i;
              const dim = hover !== null && !isActive;
              const kind = "lessThan" in d.count ? "few" : d.count.approx === 0 ? "none" : "value";
              const height =
                kind === "none"
                  ? "2px"
                  : kind === "few"
                    ? `${STUB}%`
                    : `${Math.max((("approx" in d.count ? d.count.approx : 0) / scaleMax) * 100, 4)}%`;
              return (
                <div key={d.date} className="flex h-full min-w-0 flex-1 items-end" onPointerEnter={() => setHover(i)}>
                  <div
                    className={cn(
                      "motion-grow-y w-full transition-[opacity,background-color,border-color] duration-(--dur-fast)",
                      kind === "value" && (isActive ? "bg-brand" : "bg-foreground"),
                      kind === "few" && (isActive ? "border border-brand" : "border border-foreground"),
                      kind === "none" && "bg-foreground"
                    )}
                    style={{
                      height,
                      opacity: kind === "none" ? (dim ? 0.2 : 0.35) : dim ? 0.45 : 1,
                      ["--grow-delay" as string]: `${Math.min(i * 8, 240)}ms`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div />
        <div aria-hidden="true" className="mt-2 flex justify-between text-caption text-muted-foreground">
          <span>{first ? formatDay(first) : null}</span>
          <span>{last ? `${formatDay(last)} (today)` : null}</span>
        </div>
      </div>

      <ul
        aria-label="How to read the bars"
        className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-caption text-muted-foreground"
      >
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 bg-foreground" />
          10 or more, rounded
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 border border-foreground" />
          Fewer than 10 (height not to scale)
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-2.5 shrink-0 bg-foreground opacity-35" />
          No deployments
        </li>
      </ul>

      <details className="disclosure mt-4 border-t pt-3">
        <summary className="-mx-1 w-fit items-center gap-1.5 rounded-sm px-1 py-1.5 text-label font-medium max-sm:min-h-10">
          <CaretRightIcon aria-hidden="true" className="disclosure-caret size-4" />
          Show the numbers as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto border">
          <table className="w-full text-label">
            <caption className="sr-only">Total deployments per UTC day, rounded</caption>
            <thead className="sticky top-0 bg-background-subtle text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day (UTC)
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Deployments
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    <time dateTime={d.date}>{formatDay(d.date)}</time>
                  </th>
                  <td className="px-3 py-1.5 text-right">{formatCount(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
