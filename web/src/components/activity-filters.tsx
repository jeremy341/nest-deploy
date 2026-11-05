"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Segmented } from "@/components/segmented";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  KIND_OPTIONS,
  RANGE_OPTIONS,
  type ActivityFilters as Filters,
  type KindFilter,
  type RangeFilter,
} from "@/server/activity";

const SEARCH_DELAY = 300;

/**
 * The sticky filter bar: search, kind, date range. Kind is a segmented control
 * from xl up and a select below it (eight segments do not fit a phone). Typing
 * waits a moment before it asks the server; the other controls act at once.
 */
export function ActivityFilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const [text, setText] = useState(filters.q);
  // The last text this bar sent. A different q in the URL came from elsewhere (back button, Clear filters).
  const sent = useRef(filters.q);

  useEffect(() => {
    if (filters.q !== sent.current) {
      sent.current = filters.q;
      setText(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    const next = text.replace(/\s+/g, " ").trim();
    if (next === sent.current) return;
    const t = setTimeout(() => {
      sent.current = next;
      onChange({ q: next });
    }, SEARCH_DELAY);
    return () => clearTimeout(t);
  }, [text, onChange]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = text.replace(/\s+/g, " ").trim();
    sent.current = next;
    onChange({ q: next });
  }

  return (
    <div
      role="group"
      aria-label="Filter activity"
      className="sticky top-[var(--topbar-height)] z-(--z-topbar) -mx-4 border-b bg-background-subtle px-4 py-2 sm:py-3 lg:-mx-6 lg:px-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submit} className="relative order-1 min-w-0 basis-full lg:max-w-sm lg:flex-1 lg:basis-64">
          <label htmlFor="activity-search" className="sr-only">
            Search activity
          </label>
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="activity-search"
            name="q"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by action, project or detail"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            className="pl-8"
          />
        </form>

        <NativeSelect
          aria-label="Kind"
          value={filters.kind}
          onChange={(e) => onChange({ kind: e.target.value as KindFilter })}
          className="order-2 min-w-0 flex-1 lg:w-52 lg:flex-none xl:hidden"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "all" ? "All kinds" : o.label}
            </option>
          ))}
        </NativeSelect>

        <div className="order-3 hidden w-full xl:block">
          <Segmented<KindFilter>
            label="Kind"
            value={filters.kind}
            onChange={(kind) => onChange({ kind })}
            options={KIND_OPTIONS}
          />
        </div>

        <NativeSelect
          aria-label="Date range"
          value={filters.range}
          onChange={(e) => onChange({ range: e.target.value as RangeFilter })}
          className="order-2 min-w-0 flex-1 lg:w-44 lg:flex-none"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
