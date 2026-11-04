import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { docsHref, sectionTitle, SUMMARIES } from "../_data/nav";

const TILES = ["quickstart", "servers", "hooks", "troubleshooting"];

/**
 * The four pages most readers want first. A square frame with one hairline
 * between tiles; each lights a corner on hover.
 */
export function StartTiles() {
  return (
    <ul className="mt-10 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {TILES.map((id) => (
        <li key={id} className="bg-background">
          <Link
            href={docsHref(id)}
            className="group lit-corner card-interactive block min-h-0 bg-background p-5 transition-[box-shadow,scale] duration-(--dur-fast) ease-snappy hover:z-[2] focus-visible:z-[2] active:scale-[0.99] max-sm:py-4 sm:min-h-[112px]"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-[15px] leading-[22px] font-semibold text-foreground">{sectionTitle(id)}</span>
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-fast) ease-snappy group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </span>
            <span className="mt-1.5 block text-[14px] leading-5 text-muted-foreground">{SUMMARIES[id]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
