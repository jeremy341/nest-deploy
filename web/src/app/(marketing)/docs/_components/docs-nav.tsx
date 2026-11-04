"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOCS_NAV, docsHref, sectionIdFromPath, type DocsGroup } from "../_data/nav";

/** The page the visitor is on, or null on the docs home. */
export function useCurrentDocsPage(): string | null {
  return sectionIdFromPath(usePathname());
}

function filterNav(query: string): { groups: DocsGroup[]; count: number } {
  const q = query.trim().toLowerCase();
  if (q === "") return { groups: DOCS_NAV, count: DOCS_NAV.reduce((n, g) => n + g.sections.length, 0) };
  const groups: DocsGroup[] = [];
  let count = 0;
  for (const g of DOCS_NAV) {
    const groupMatch = g.group.toLowerCase().includes(q);
    const sections = g.sections.filter(
      (s) =>
        groupMatch ||
        s.title.toLowerCase().includes(q) ||
        s.subsections.some((sub) => sub.title.toLowerCase().includes(q))
    );
    if (sections.length > 0) {
      groups.push({ group: g.group, sections });
      count += sections.length;
    }
  }
  return { groups, count };
}

/**
 * The filter field and the grouped list of pages. Used by the desktop rail
 * and by the phone panel. A lit square marks the page you are on.
 */
export function DocsNavBody({
  variant,
  onNavigate,
}: {
  variant: "rail" | "panel";
  onNavigate?: () => void;
}) {
  const rail = variant === "rail";
  const current = useCurrentDocsPage();
  const [query, setQuery] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const { groups, count } = useMemo(() => filterNav(query), [query]);
  const filtering = query.trim() !== "";

  // "/" focuses the filter when focus is not already in a field (desktop rail only).
  useEffect(() => {
    if (!rail) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rail]);

  // Keep the current page inside the rail's own scroll area, without moving the page.
  useEffect(() => {
    if (!rail || filtering) return;
    const link = document.querySelector<HTMLElement>('[data-docs-scroller] [aria-current="page"]');
    const scroller = link?.closest<HTMLElement>("[data-docs-scroller]");
    if (!link || !scroller) return;
    const l = link.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const inset = (scroller.querySelector<HTMLElement>("[data-docs-filter]")?.offsetHeight ?? 0) + 8;
    if (l.top < s.top + inset) scroller.scrollTop -= s.top + inset - l.top;
    else if (l.bottom > s.bottom - 8) scroller.scrollTop += l.bottom - (s.bottom - 8);
  }, [rail, filtering, current]);

  const linkClass = cn(
    "relative block rounded-md px-3 py-1.5 text-[14px] leading-5 text-muted-foreground -outline-offset-2 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground",
    !rail && "flex min-h-10 items-center"
  );

  return (
    <div>
      <div
        data-docs-filter={rail ? "" : undefined}
        className={rail ? "sticky top-0 z-10 -mx-1 bg-background px-1 pt-1 pb-2" : undefined}
      >
        <div className="relative">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground"
          />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Filter pages…"
            aria-label="Filter docs pages"
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            className={cn("peer pr-8 pl-8", rail && "h-9 text-[13px] md:text-[13px]")}
          />
          {rail && !query ? (
            <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 font-sans text-caption text-muted-foreground peer-focus:hidden pointer-fine:inline-block">
              /
            </kbd>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {filtering ? `${count} ${count === 1 ? "page" : "pages"}` : ""}
      </p>

      <div id={listId}>
        {groups.length === 0 ? (
          <div className="mt-4 px-1">
            <p className="text-[14px] leading-5 text-muted-foreground">No pages match &ldquo;{query.trim()}&rdquo;.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setQuery("")}>
              Clear filter
            </Button>
          </div>
        ) : (
          <div className={cn("relative", rail ? "ml-1 border-l" : "mt-2")}>
            {groups.map(({ group, sections }) => {
              const labelId = `${listId}-${group.replace(/\s+/g, "-")}`;
              return (
                <div key={group} className="mt-6 first:mt-2">
                  <p id={labelId} className="mb-1.5 px-3 text-[12px] leading-4 font-medium text-subtle-foreground">
                    {group}
                  </p>
                  <ul aria-labelledby={labelId}>
                    {sections.map((section) => {
                      const isCurrent = section.id === current;
                      return (
                        <li key={section.id} className="relative">
                          <Link
                            href={docsHref(section.id)}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={onNavigate}
                            className={cn(linkClass, isCurrent && "font-medium text-foreground")}
                          >
                            {section.title}
                          </Link>
                          {isCurrent && rail ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute top-1/2 -left-[3px] size-[5px] -translate-y-1/2 bg-[var(--pixel-lit)]"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The desktop rail: sticky, scrolls on its own, shows which page you are on. */
export function DocsNav() {
  return (
    <nav
      aria-label="Docs"
      data-docs-scroller
      className="sticky top-[88px] -mx-1 -mt-1 max-h-[calc(100dvh-112px)] overflow-y-auto overscroll-contain pr-3 pb-8 pl-1 [scrollbar-width:thin]"
    >
      <DocsNavBody variant="rail" />
    </nav>
  );
}
