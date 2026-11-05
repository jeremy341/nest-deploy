"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { loadMoreActivity } from "@/app/(app)/activity/actions";
import { ActivityFilterBar } from "@/components/activity-filters";
import { ActivityRow } from "@/components/activity-row";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  describeFilters,
  groupByDay,
  isFiltered,
  plural,
  serializeFilters,
  DEFAULT_FILTERS,
  type ActivityFilters,
} from "@/server/activity";
import type { ActivityPage } from "@/server/activity-query";

const LIST = "hairline-y overflow-hidden rounded-lg bg-card shadow-border-small";

/**
 * The Activity page body. The filters live in the URL (so a filtered view can
 * be bookmarked) and the server applies them; this component only moves them
 * between the controls and the address bar, and appends further pages.
 */
export function ActivityView({
  filters,
  initial,
}: {
  filters: ActivityFilters;
  initial: ActivityPage;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (patch: Partial<ActivityFilters>) => {
      const query = serializeFilters({ ...filters, ...patch });
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [filters, pathname, router]
  );

  const clear = useCallback(() => apply(DEFAULT_FILTERS), [apply]);

  return (
    <div aria-busy={pending}>
      <ActivityFilterBar filters={filters} onChange={apply} />
      <ActivityResults
        filters={filters}
        initial={initial}
        pending={pending}
        onClear={clear}
      />
    </div>
  );
}

function ActivityResults({
  filters,
  initial,
  pending,
  onClear,
}: {
  filters: ActivityFilters;
  initial: ActivityPage;
  pending: boolean;
  onClear: () => void;
}) {
  const [data, setData] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const focusAfterLoad = useRef<number | null>(null);

  // A new answer from the server (other filters, a refresh) replaces whatever was loaded on top of the old one.
  if (seen !== initial) {
    setSeen(initial);
    setData(initial);
    setFailed(false);
  }
  const { items, nextCursor: cursor, total, capped, now } = data;

  const filtered = isFiltered(filters);
  const groups = useMemo(() => groupByDay(items, new Date(now)), [items, now]);
  const nowMs = Date.parse(now);

  // Once more rows are in, move focus to the first new one if the button that was focused is gone.
  useEffect(() => {
    const id = focusAfterLoad.current;
    if (id === null) return;
    focusAfterLoad.current = null;
    if (cursor === null) document.getElementById(`activity-${id}`)?.focus();
  }, [items, cursor]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loadMoreActivity({
        kind: filters.kind,
        range: filters.range,
        q: filters.q,
        cursor,
      });
      focusAfterLoad.current = next.items[0]?.id ?? null;
      setData((prev) => {
        const have = new Set(prev.items.map((i) => i.id));
        return {
          ...next,
          items: [...prev.items, ...next.items.filter((i) => !have.has(i.id))],
          total: next.total ?? prev.total,
        };
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const known = cursor === null ? items.length : total;
  const summary =
    items.length === 0
      ? ""
      : known !== null
        ? `Showing ${items.length} of ${plural(known, "change")}`
        : `Showing ${plural(items.length, "change")}, more available`;

  return (
    <>
      <div className="mt-4 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p role="status" className="tabular text-label text-muted-foreground">
          {summary}
          {pending ? " Updating…" : ""}
          {capped ? " Searched the latest 5,000 entries." : ""}
        </p>
        {filtered && items.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="-mr-2.5">
            Clear filters
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-2">
          {filtered ? (
            <EmptyState
              as="h2"
              icon={<ClockCounterClockwiseIcon />}
              title="Nothing in this range yet"
              description={
                <>
                  No activity matches {describeFilters(filters)}. Try a wider range or another kind.
                </>
              }
              action={
                <Button variant="outline" onClick={onClear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              as="h2"
              icon={<ClockCounterClockwiseIcon />}
              title="No activity yet"
              description="Deploys, setting changes and restarts show up here."
            />
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-6">
          {groups.map((g, i) => {
            const last = i === groups.length - 1;
            const label = `${g.items.length}${last && cursor !== null ? "+" : ""}`;
            return (
              <section key={g.day} aria-labelledby={`day-${g.day}`}>
                <h2
                  id={`day-${g.day}`}
                  className="mb-2 flex items-baseline gap-2 text-label font-medium text-muted-foreground"
                >
                  <span className="text-foreground">{g.label}</span>
                  <span className="tabular font-normal">
                    <span aria-hidden="true">{label}</span>
                    <span className="sr-only">{`${label.replace("+", " or more")} ${g.items.length === 1 && !label.includes("+") ? "change" : "changes"}`}</span>
                  </span>
                </h2>
                <ol className={LIST}>
                  {g.items.map((item) => (
                    <ActivityRow key={item.id} item={item} now={nowMs} />
                  ))}
                </ol>
              </section>
            );
          })}

          {failed ? (
            <Alert
              tone="error"
              role="alert"
              title="Could not load more"
              action={
                <Button size="sm" variant="outline" onClick={loadMore}>
                  Try again
                </Button>
              }
            >
              Something went wrong. Your filters are unchanged.
            </Alert>
          ) : null}

          {cursor !== null ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} loading={loading} className="max-sm:w-full">
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
