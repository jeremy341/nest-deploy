import { countValue, describeCount, formatCount, type Count } from "@/lib/stats-format";
import { TableDisclosure } from "./figures";

type Runtime = { runtime: string; count: Count };

/**
 * One colour per runtime, always the same one: the first four slots of the
 * data-visualisation palette (light, dark), checked for colour-blind
 * separation between neighbours. Colour is never the only cue: each runtime
 * is also named in the legend with its own count, and there is a table.
 */
const STYLE: Record<string, { label: string; swatch: string }> = {
  node: { label: "Node", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  python: { label: "Python", swatch: "bg-[#eb6834] dark:bg-[#d95926]" },
  static: { label: "Static site", swatch: "bg-[#1baf7a] dark:bg-[#199e70]" },
  command: { label: "Custom command", swatch: "bg-[#eda100] dark:bg-[#c98500]" },
};

function styleFor(runtime: string) {
  return STYLE[runtime] ?? { label: runtime, swatch: "bg-foreground" };
}

/**
 * Projects per runtime as one stacked bar. Only runtimes with 10 or more
 * projects are drawn, and their widths are shares of each other, so the bar
 * never implies a size for a runtime whose count is hidden. A runtime with
 * fewer than 10 is listed in the legend as a bound and left out of the bar.
 */
export function RuntimeBar({ runtimes }: { runtimes: Runtime[] }) {
  const drawn = runtimes.filter((r) => "approx" in r.count && r.count.approx > 0);
  const hidden = runtimes.length - drawn.length;

  const summary =
    drawn.length === 0
      ? "No runtime has 10 or more projects, so there is no bar."
      : `Projects by runtime. ${drawn
          .map((r) => `${styleFor(r.runtime).label}: ${describeCount(r.count)}`)
          .join(". ")}.${hidden > 0 ? ` ${hidden} more with fewer than 10 are not drawn.` : ""}`;

  return (
    <figure>
      <figcaption className="text-label font-medium">Projects by runtime</figcaption>

      {drawn.length === 0 ? (
        <p className="mt-3 border border-dashed px-3 py-4 text-label text-muted-foreground">
          No runtime has 10 or more projects yet, so there is no bar to draw.
        </p>
      ) : (
        <div role="img" aria-label={summary} className="mt-3 flex h-6 gap-[2px]">
          {drawn.map((r) => (
            <div
              key={r.runtime}
              className={styleFor(r.runtime).swatch}
              style={{ flexGrow: countValue(r.count), flexBasis: 0, minWidth: 4 }}
            />
          ))}
        </div>
      )}

      <ul className="mt-4 hairline-y border-y">
        {runtimes.map((r) => (
          <li key={r.runtime} className="flex items-center gap-3 py-2 text-label">
            <span
              aria-hidden="true"
              className={
                "lessThan" in r.count
                  ? "size-2.5 shrink-0 border border-dashed border-foreground/50"
                  : `size-2.5 shrink-0 ${styleFor(r.runtime).swatch}`
              }
            />
            <span className="min-w-0 flex-1">{styleFor(r.runtime).label}</span>
            <span className="tabular text-right">{formatCount(r.count)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">
        {drawn.length > 0
          ? `Bar widths compare the ${drawn.length === 1 ? "runtime" : "runtimes"} with 10 or more projects. Dashed squares are runtimes with fewer than 10, left out of the bar.`
          : "Dashed squares are runtimes with fewer than 10 projects."}
      </p>

      <TableDisclosure
        caption="Projects per runtime, rounded"
        head={["Runtime", "Projects"]}
        rows={runtimes.map((r) => [styleFor(r.runtime).label, formatCount(r.count)])}
      />
    </figure>
  );
}
