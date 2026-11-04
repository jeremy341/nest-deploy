"use client";

import { useMemo, useState } from "react";
import { CubeIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { DeploymentRow } from "@/components/deployment-row";
import { Stagger } from "@/components/motion/stagger";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  applyDeploymentQuery,
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
  const [query, setQuery] = useState<DeploymentQuery>(DEFAULT_QUERY);
  const [shown, setShown] = useState(PAGE);
  const set = <K extends keyof DeploymentQuery>(key: K, value: DeploymentQuery[K]) => {
    setQuery((q) => ({ ...q, [key]: value }));
    setShown(PAGE); // a new filter starts again from the top of the list
  };

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
        description="Deploy a project and its releases will be listed here."
      />
    );
  }

  const page = visible.slice(0, shown);
  const rows = page.map((d) => (
    <DeploymentRow key={d.id} deployment={d} showProject={showProject} demo={demo} />
  ));
  const filtered = !isDefaultQuery(query);

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
          <p role="status" aria-live="polite" className="text-label text-muted-foreground">
            {filtered
              ? `${visible.length} of ${deployments.length} deployments`
              : `${deployments.length} deployments`}
          </p>
          {filtered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(DEFAULT_QUERY);
                setShown(PAGE);
              }}
            >
              <XIcon />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

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
                onClick={() => {
                  setQuery(DEFAULT_QUERY);
                  setShown(PAGE);
                }}
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
