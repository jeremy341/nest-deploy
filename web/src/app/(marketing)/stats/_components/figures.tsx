import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { formatCount, type Count } from "@/lib/stats-format";
import { cn } from "@/lib/utils";
import { ROW } from "./layout";

/** A rounded figure. A bound reads as words, in smaller type, so it is never mistaken for a count. */
export function Figure({ count, small, display }: { count: Count; small?: boolean; display?: boolean }) {
  return "lessThan" in count ? (
    <span className="text-title-2 inline-flex items-center gap-2.5">
      {/* The hollow square is the chart legend's mark for "fewer than 10". */}
      <span aria-hidden="true" className="size-2.5 shrink-0 border border-current" />
      Fewer than {formatCount({ approx: count.lessThan })}
    </span>
  ) : (
    <span
      className={cn(
        "tabular",
        display ? "font-mono text-[clamp(2.75rem,5.5vw,4rem)] leading-none font-medium tracking-[-0.05em]" : small ? "text-title-2" : "text-stat"
      )}
    >
      {formatCount(count)}
    </span>
  );
}

/** A whole number that is not a count (a percentage or a time). */
export function Value({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return <span className={cn("tabular", small ? "text-title-2" : "text-stat")}>{children}</span>;
}

/** The figure that stands in when the sample is too small. */
export function NotEnough() {
  return <span className="text-title-2 text-muted-foreground">Not enough data</span>;
}

/** One row of a definition list: label and hint on the left, the figure on the right. */
export function Total({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={ROW}>
      <dt className="text-body font-medium">{label}</dt>
      <dd className="col-start-1 text-caption text-muted-foreground">{hint}</dd>
      <dd className="col-start-2 row-span-2 row-start-1 text-right">{children}</dd>
    </div>
  );
}

/** Heading and one plain sentence for a group of figures. */
export function SectionHead({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[56ch]">
      <h2 id={id} className="font-pixel text-docs-h2">
        {title}
      </h2>
      <p className="mt-2 text-body-lg text-muted-foreground">{children}</p>
    </div>
  );
}

/** Small label above a figure inside a frame. */
export function FrameLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-label text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * The same facts as a chart, as a table, inside a closed disclosure.
 * Works from server and client components alike (no state of its own).
 */
export function TableDisclosure({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: [string, string];
  rows: [React.ReactNode, string][];
}) {
  return (
    <details className="disclosure mt-4 border-t pt-3">
      <summary className="-mx-1 w-fit items-center gap-1.5 rounded-sm px-1 py-1.5 text-label font-medium max-sm:min-h-10">
        <CaretRightIcon aria-hidden="true" className="disclosure-caret size-4" />
        Show the numbers as a table
      </summary>
      <div className="mt-2 max-h-64 overflow-auto border">
        <table className="w-full text-label">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-background-subtle text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {head[0]}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {head[1]}
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map(([label, value], i) => (
              <tr key={i} className="border-t">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  {label}
                </th>
                <td className="px-3 py-1.5 text-right">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
