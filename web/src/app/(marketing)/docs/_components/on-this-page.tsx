"use client";

import { useScrollSpy } from "@/components/motion/use-scroll-spy";
import { cn } from "@/lib/utils";
import type { DocsSubsection } from "../_data/nav";

/**
 * The headings of the page you are reading, in a rail on wide screens, with
 * the one in view marked. Plain hash links: the browser does the scrolling.
 * Pages without sub-headings show nothing.
 */
export function OnThisPage({ items }: { items: DocsSubsection[] }) {
  const active = useScrollSpy(
    items.map((i) => i.id),
    { offset: 96 }
  );
  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-[88px] hidden xl:block">
      <p className="text-[12px] leading-4 font-medium text-subtle-foreground">On this page</p>
      <ul className="mt-3 border-l">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id} className="relative">
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "block py-1 pr-2 pl-3 text-[13px] leading-5 text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground",
                  current && "text-foreground"
                )}
              >
                {item.title}
              </a>
              {current ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 -left-[3px] size-[5px] -translate-y-1/2 bg-[var(--pixel-lit)]"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
