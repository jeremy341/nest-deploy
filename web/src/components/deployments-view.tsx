"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowsLeftRightIcon,
  CubeIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api } from "@/components/api";
import { DeploymentCompare } from "@/components/deployment-compare";
import { DeploymentRow } from "@/components/deployment-row";
import { Stagger } from "@/components/motion/stagger";
import { Segmented } from "@/components/segmented";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import {
  applyDeploymentQuery,
  bulkSummary,
  canBulkCancel,
  canBulkDelete,
  canCompare,
  DEFAULT_QUERY,
  isDefaultQuery,
  statusCounts,
  type DeploymentQuery,
  type EnvFilter,
  type RangeFilter,
  type SortKey,
  type StatusFilter,
} from "@/lib/deployments-filter";
import type { DeploymentView } from "@/server/queries";
import { cn } from "@/lib/utils";

const LIST = "hairline-y overflow-hidden rounded-lg bg-card shadow-border-small";
const PAGE = 25;

type BulkResult = { id: string; ok: boolean; message?: string };

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "longest", label: "Longest build" },
  { value: "shortest", label: "Shortest build" },
];

const RANGES: { value: RangeFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function DeploymentsView({
  deployments,
  showProject = true,
  demo = false,
}: {
  deployments: DeploymentView[];
  showProject?: boolean;
  /** Sample data on the homepage: only the status filter, rows are not links. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState<DeploymentQuery>(DEFAULT_QUERY);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  // The clock is read after mount, so the server render and the first client render match.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);
  const set = <K extends keyof DeploymentQuery>(key: K, value: DeploymentQuery[K]) => {
    setQuery((q) => ({ ...q, [key]: value }));
    setShown(PAGE); // a new filter starts again from the top of the list
    clearSelection(); // a selection never carries rows the filter just hid
  };
  const resetQuery = () => {
    setQuery(DEFAULT_QUERY);
    setShown(PAGE);
    clearSelection();
  };
  function clearSelection() {
    setSelected(new Set());
    setComparing(false);
  }
  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setComparing(false);
  }

  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of deployments) seen.set(d.projectId, d.projectName);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [deployments]);

  const visible = useMemo(() => applyDeploymentQuery(deployments, query), [deployments, query]);
  const counts = useMemo(() => statusCounts(deployments, query), [deployments, query]);

  if (deployments.length === 0) {
    return (
      <EmptyState
        icon={<CubeIcon />}
        title="No deployments yet"
        description={
          showProject
            ? "Open a project and press Deploy. Every build and release lands here, newest first."
            : "Press Deploy on the overview. Every build and release of this project lands here, newest first."
        }
        action={
          showProject ? (
            <Button variant="outline" render={<Link href="/projects" />}>
              Go to projects
            </Button>
          ) : undefined
        }
      />
    );
  }

  const page = visible.slice(0, shown);
  const rows = page.map((d) => (
    <DeploymentRow
      key={d.id}
      deployment={d}
      showProject={showProject}
      demo={demo}
      selected={selected.has(d.id)}
      onSelectedChange={demo ? undefined : (checked) => toggle(d.id, checked)}
    />
  ));
  const filtered = !isDefaultQuery(query);

  // Only rows that are on screen count, so the numbers match what you can see.
  const picked = visible.filter((d) => selected.has(d.id));
  const allShownPicked = page.length > 0 && page.every((d) => selected.has(d.id));
  const somePicked = page.some((d) => selected.has(d.id));
  const allowed = bulkSummary(picked, now ?? 0);
  const pair = canCompare(picked.length) ? ([picked[0], picked[1]] as const) : null;

  /** Tell the person what happened per item, then refresh the list. */
  function report(results: BulkResult[], past: string, noun: string) {
    const done = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (done > 0) toast.success(`${past} ${done} ${done === 1 ? noun : noun + "s"}`);
    if (failed.length > 0) {
      const first = failed[0].message ?? "Something went wrong";
      toast.error(
        `${failed.length} could not be ${past.toLowerCase()}`,
        failed.length > 1 ? `${first} (and ${failed.length - 1} more)` : first
      );
    }
    clearSelection();
    router.refresh();
  }

  async function bulk(path: "bulk-cancel" | "bulk-delete", eligible: (d: DeploymentView) => boolean) {
    const ids = picked.filter(eligible).map((d) => d.id);
    const res = await api<{ results: BulkResult[] }>(`/api/deployments/${path}`, {
      body: { ids },
    });
    return res.results;
  }

  async function bulkCancel() {
    try {
      report(await bulk("bulk-cancel", canBulkCancel), "Canceled", "deployment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function bulkDelete() {
    // A throw keeps the dialog open with the message, so it is only used when nothing worked.
    const results = await bulk("bulk-delete", (d) => canBulkDelete(d));
    if (results.length > 0 && results.every((r) => !r.ok)) {
      throw new Error(results[0].message ?? "None of the previews could be deleted.");
    }
    report(results, "Deleted", "preview");
  }

  const statusFilter = (
    <Segmented<StatusFilter>
      label="Filter by status"
      value={query.status}
      onChange={(v) => set("status", v)}
      options={[
        { value: "all", label: demo ? "All" : `All ${counts.all}` },
        { value: "ready", label: demo ? "Ready" : `Ready ${counts.ready}` },
        { value: "building", label: demo ? "Building" : `Building ${counts.building}` },
        { value: "error", label: demo ? "Error" : `Error ${counts.error}` },
      ]}
    />
  );

  // The homepage sample keeps its simple status filter.
  if (demo) {
    return (
      <div>
        <div className="mb-4">{statusFilter}</div>
        {visible.length === 0 ? (
          <div className="rounded-lg bg-card px-4 shadow-border-small">
            <EmptyState
              size="compact"
              icon={<CubeIcon />}
              title={`No ${query.status} deployments`}
              description="Deployments with this status will show up here."
            />
          </div>
        ) : (
          <ul className={LIST}>{rows}</ul>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-sm:basis-full">
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search deployments"
              placeholder="Search by commit, branch, author or #pr…"
              value={query.search}
              onChange={(e) => set("search", e.target.value)}
              className="pl-8 max-sm:h-10"
            />
          </div>
          <NativeSelect
            aria-label="Sort deployments"
            value={query.sort}
            onChange={(e) => set("sort", e.target.value as SortKey)}
            className="w-auto max-sm:w-[calc(50%-0.25rem)]"
            selectClassName="max-sm:h-10"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by time"
            value={query.range}
            onChange={(e) => set("range", e.target.value as RangeFilter)}
            className="w-auto max-sm:w-[calc(50%-0.25rem)]"
            selectClassName="max-sm:h-10"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusFilter}
          <Segmented<EnvFilter>
            label="Filter by environment"
            value={query.env}
            onChange={(v) => set("env", v)}
            options={[
              { value: "all", label: "All envs" },
              { value: "production", label: "Production" },
              { value: "preview", label: "Preview" },
            ]}
          />
          {showProject && projects.length > 1 ? (
            <NativeSelect
              aria-label="Filter by project"
              value={query.project}
              onChange={(e) => set("project", e.target.value)}
              className="w-auto max-sm:w-full"
              selectClassName="max-sm:h-10"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>

        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="inline-flex min-h-10 items-center gap-2 text-label text-muted-foreground sm:min-h-8">
              <input
                type="checkbox"
                checked={allShownPicked}
                ref={(el) => {
                  if (el) el.indeterminate = somePicked && !allShownPicked;
                }}
                disabled={page.length === 0}
                onChange={(e) => {
                  setSelected(e.target.checked ? new Set(page.map((d) => d.id)) : new Set());
                  setComparing(false);
                }}
              />
              Select all shown
            </label>
            <p
              role="status"
              aria-live="polite"
              className={cn("tabular text-label text-muted-foreground", !filtered && "sr-only")}
            >
              {filtered
                ? `${visible.length} of ${deployments.length} deployments`
                : `${deployments.length} deployments`}
            </p>
          </div>
          {filtered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetQuery}
            >
              <XIcon />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {picked.length > 0 ? (
        <div
          role="region"
          aria-label="Actions for selected deployments"
          className="mb-4 space-y-2 rounded-lg bg-card p-3 shadow-border-small"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" aria-live="polite" className="mr-auto font-medium tracking-[-0.02em]">
              {picked.length} selected
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pair}
              onClick={() => setComparing(true)}
            >
              <ArrowsLeftRightIcon aria-hidden="true" />
              Compare
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={allowed.cancel === 0}
              onClick={() => void bulkCancel()}
            >
              <ProhibitIcon aria-hidden="true" />
              Cancel{allowed.cancel > 0 ? ` (${allowed.cancel})` : ""}
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={allowed.delete === 0}>
                  <TrashIcon aria-hidden="true" />
                  Delete previews{allowed.delete > 0 ? ` (${allowed.delete})` : ""}
                </Button>
              }
              tone="destructive"
              title={`Delete ${allowed.delete} ${allowed.delete === 1 ? "preview" : "previews"}?`}
              description="Each preview is stopped and its files are removed from your container. This cannot be undone. Production releases and the live release are never deleted."
              confirmLabel="Delete previews"
              pendingLabel="Deleting…"
              onConfirm={bulkDelete}
            />
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              <XIcon aria-hidden="true" />
              Clear selection
            </Button>
          </div>
          <p className="text-label text-muted-foreground">
            Compare needs exactly two. Cancel and Delete previews only apply to previews: Cancel to
            ones still running, Delete to ones older than a day. Other selected rows are skipped.
          </p>
        </div>
      ) : null}

      {comparing && pair ? (
        <DeploymentCompare a={pair[0]} b={pair[1]} onClose={() => setComparing(false)} />
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-lg bg-card px-4 shadow-border-small">
          <EmptyState
            size="compact"
            icon={<MagnifyingGlassIcon />}
            title="No deployments match"
            description="Try a different search or clear a filter."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetQuery}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Stagger aria-label="Deployments" className={cn(LIST)}>
            {rows}
          </Stagger>
          {visible.length > shown ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
