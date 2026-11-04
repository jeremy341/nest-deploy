import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { docsHref, groupOf, neighbors } from "../_data/nav";

const card =
  "group lit-corner card-interactive flex min-w-0 flex-1 flex-col gap-1 bg-background p-5 transition-[box-shadow,scale] duration-(--dur-fast) ease-snappy hover:z-[2] focus-visible:z-[2] active:scale-[0.99] max-sm:py-4";

/**
 * The page before and after this one, in reading order, so the docs can be
 * read straight through. Crossing into another group names the group.
 */
export function PrevNext({ sectionId }: { sectionId: string }) {
  const { prev, next } = neighbors(sectionId);
  if (!prev && !next) return null;
  const here = groupOf(sectionId);

  return (
    <nav aria-label="Previous and next page" className="mt-16 flex flex-col gap-px border bg-border sm:flex-row">
      {prev ? (
        <Link href={docsHref(prev.id)} rel="prev" className={card}>
          <span className="flex items-center gap-1.5 text-label text-muted-foreground">
            <ArrowLeftIcon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-(--dur-fast) ease-snappy group-hover:-translate-x-0.5"
            />
            Previous
          </span>
          <span className="text-[15px] leading-[22px] font-semibold text-foreground">{prev.title}</span>
          {groupOf(prev.id) !== here ? (
            <span className="text-label text-muted-foreground">{groupOf(prev.id)}</span>
          ) : null}
        </Link>
      ) : (
        <span className="hidden flex-1 bg-background sm:block" aria-hidden="true" />
      )}
      {next ? (
        <Link href={docsHref(next.id)} rel="next" className={cn(card, "sm:items-end sm:text-right")}>
          <span className="flex items-center gap-1.5 text-label text-muted-foreground">
            Next
            <ArrowRightIcon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-(--dur-fast) ease-snappy group-hover:translate-x-0.5"
            />
          </span>
          <span className="text-[15px] leading-[22px] font-semibold text-foreground">{next.title}</span>
          {groupOf(next.id) !== here ? (
            <span className="text-label text-muted-foreground">{groupOf(next.id)}</span>
          ) : null}
        </Link>
      ) : (
        <span className="hidden flex-1 bg-background sm:block" aria-hidden="true" />
      )}
    </nav>
  );
}
