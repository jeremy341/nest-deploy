import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { CheckCircleIcon, InfoIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { sectionTitle, subsectionTitle, headingId } from "../_data/nav";
import { HeadingAnchor } from "./heading-anchor";

// Server components only. The two client pieces (the heading anchor and the
// code block's copy button) are imported where they are used.

/** Inline code. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] bg-[var(--ds-gray-100)] px-1 py-px font-mono text-[0.875em] text-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-200)] [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

/** Bold lead-in for a list item. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-4 max-w-[68ch] text-prose text-reading", className)}>{children}</p>;
}

const linkClass = "link font-medium text-foreground";

/** A link to another page of this site. */
export function InternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

/** A link that leaves the site. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * Heading row. The anchor sits beside the heading rather than inside it, so
 * the heading's accessible name stays just its title.
 */
function HeadingRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("group relative flex items-center gap-2 lg:block", className)}>{children}</div>;
}

/** One whole docs page: its title is the page's only `h1`. */
export function Section({
  id,
  intro,
  children,
}: {
  id: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const title = sectionTitle(id);
  const hid = headingId(id);
  return (
    <section id={id} aria-labelledby={hid}>
      <h1
        id={hid}
        tabIndex={-1}
        className="font-pixel text-docs-h2 text-foreground outline-none max-sm:text-[28px] max-sm:leading-9"
      >
        {title}
      </h1>
      {intro ? <p className="mt-3 max-w-[68ch] text-docs-lead text-muted-foreground">{intro}</p> : null}
      {children}
    </section>
  );
}

export function H3({ id }: { id: string }) {
  const title = subsectionTitle(id);
  return (
    <HeadingRow className="mt-10">
      <h3
        id={id}
        tabIndex={-1}
        className="min-w-0 scroll-mt-24 text-docs-h3 text-foreground max-lg:scroll-mt-32"
      >
        {title}
      </h3>
      <HeadingAnchor id={id} title={title} />
    </HeadingRow>
  );
}

const bullets =
  "[&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:top-[0.7em] [&>li]:before:left-0 [&>li]:before:size-[5px] [&>li]:before:bg-[var(--subtle-foreground)] [&>li]:before:content-['']";

export function List({ children, ordered }: { children: ReactNode; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "mt-4 max-w-[68ch] space-y-2 text-prose text-reading",
        ordered ? "list-decimal pl-5 marker:font-medium marker:text-subtle-foreground marker:tabular-nums" : bullets
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Soft edge shadows that appear only on a side that has more to scroll to
 * (the "local" layers hide the "scroll" layers once you reach that end).
 */
const SCROLL_SHADOW: CSSProperties = {
  background: [
    "linear-gradient(to right, var(--background) 30%, transparent) 0 0 / 32px 100% no-repeat local",
    "linear-gradient(to left, var(--background) 30%, transparent) 100% 0 / 32px 100% no-repeat local",
    "linear-gradient(to right, color-mix(in oklab, var(--foreground) 14%, transparent), transparent) 0 0 / 14px 100% no-repeat scroll",
    "linear-gradient(to left, color-mix(in oklab, var(--foreground) 14%, transparent), transparent) 100% 0 / 14px 100% no-repeat scroll",
  ].join(", "),
};

export function Table({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: ReactNode[][];
  /** Accessible name for the scrollable region: the nearest heading. */
  caption: string;
}) {
  const wide = head.length >= 3;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      style={SCROLL_SHADOW}
      className="mt-6 overflow-x-auto border"
    >
      <table
        className={cn("w-full border-collapse text-left text-docs-small", wide && "min-w-[560px]")}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-background-subtle">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="border-b px-4 py-2.5 text-[13px] max-sm:px-3 font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    // Code in a cell breaks at spaces, never in the middle of a name.
                    "px-4 py-3 align-top max-sm:px-3 [&_code]:[overflow-wrap:normal]",
                    j === 0 ? "font-medium text-foreground sm:whitespace-nowrap" : "text-reading",
                    j === 0 && !wide && "sm:w-[34%]",
                    // Short values such as a command stay on one line in wide tables.
                    wide && j === r.length - 1 && "sm:whitespace-nowrap"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TONES = {
  note: { token: "note", Icon: InfoIcon },
  tip: { token: "success", Icon: CheckCircleIcon },
  warning: { token: "warning", Icon: WarningIcon },
} as const;

const toneClass = {
  note: "bg-[var(--tone-note-bg)] shadow-[inset_0_0_0_1px_var(--tone-note-ring)]",
  success: "bg-[var(--tone-success-bg)] shadow-[inset_0_0_0_1px_var(--tone-success-ring)]",
  warning: "bg-[var(--tone-warning-bg)] shadow-[inset_0_0_0_1px_var(--tone-warning-ring)]",
} as const;

const iconClass = {
  note: "text-[var(--tone-note-icon)]",
  success: "text-[var(--tone-success-icon)]",
  warning: "text-[var(--tone-warning-icon)]",
} as const;

export function Callout({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  children: ReactNode;
}) {
  const { token, Icon } = TONES[tone];
  return (
    <div role="note" className={cn("mt-6 flex max-w-[68ch] gap-3 p-4", toneClass[token])}>
      <Icon aria-hidden="true" weight="regular" className={cn("mt-1 size-4 shrink-0", iconClass[token])} />
      <div className="min-w-0">
        <p className="text-[14px] leading-6 font-semibold text-foreground">{title}</p>
        <div className="mt-1 text-docs-small text-foreground/85">{children}</div>
      </div>
    </div>
  );
}
