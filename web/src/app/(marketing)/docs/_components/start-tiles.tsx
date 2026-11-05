import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { docsHref, sectionTitle, SUMMARIES } from "../_data/nav";

const FIRST = "quickstart";
const NEXT = ["servers", "hooks", "troubleshooting"];

const tile =
  "group lit-corner card-interactive bg-background transition-[box-shadow,scale] duration-(--dur-fast) ease-snappy hover:z-[2] focus-visible:z-[2] active:scale-[0.99]";
const arrow =
  "size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-fast) ease-snappy group-hover:translate-x-0.5 group-hover:text-foreground";

/**
 * Where to begin. One large tile for the quick start, which is what most
 * people want, and three plain rows beside it. A square frame with a single
 * hairline between the parts; each lights a corner on hover.
 */
export function StartTiles() {
  return (
    <div className="mt-10 grid gap-px border bg-border lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <Link href={docsHref(FIRST)} className={`${tile} flex min-h-[148px] flex-col justify-between gap-8 p-6 lg:min-h-[240px]`}>
        <span className="font-pixel text-[28px] leading-8 font-medium text-foreground">{sectionTitle(FIRST)}</span>
        <span className="flex items-end justify-between gap-4">
          <span className="max-w-[26ch] text-[15px] leading-6 text-muted-foreground">{SUMMARIES[FIRST]}</span>
          <ArrowRightIcon aria-hidden="true" className={arrow} />
        </span>
      </Link>
      <ul className="grid gap-px bg-border">
        {NEXT.map((id) => (
          <li key={id} className="bg-background">
            <Link href={docsHref(id)} className={`${tile} flex h-full items-center justify-between gap-4 px-5 py-4`}>
              <span>
                <span className="block text-[15px] leading-[22px] font-semibold text-foreground">{sectionTitle(id)}</span>
                <span className="mt-0.5 block text-[14px] leading-5 text-muted-foreground">{SUMMARIES[id]}</span>
              </span>
              <ArrowRightIcon aria-hidden="true" className={arrow} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
