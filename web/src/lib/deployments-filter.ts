import type { DeploymentView } from "@/server/queries";

/** Everything the deployments list can be narrowed or ordered by. */
export type StatusFilter = "all" | "ready" | "building" | "error";
export type EnvFilter = "all" | "production" | "preview";
export type RangeFilter = "any" | "24h" | "7d" | "30d";
export type SortKey = "newest" | "oldest" | "longest" | "shortest";

export type DeploymentQuery = {
  search: string;
  status: StatusFilter;
  env: EnvFilter;
  /** A project id, or "all". */
  project: string;
  range: RangeFilter;
  sort: SortKey;
};

export const DEFAULT_QUERY: DeploymentQuery = {
  search: "",
  status: "all",
  env: "all",
  project: "all",
  range: "any",
  sort: "newest",
};

const RANGE_MS: Record<Exclude<RangeFilter, "any">, number> = {
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

/** "building" covers queued and deploying too; "error" covers canceled, as the status pills do. */
export function statusMatches(d: DeploymentView, status: StatusFilter): boolean {
  switch (status) {
    case "all":
      return true;
    case "ready":
      return d.state === "ready";
    case "building":
      return d.state === "building" || d.state === "queued";
    case "error":
      return d.state === "error" || d.state === "canceled";
  }
}

/**
 * Every word typed has to match somewhere in the deployment: project, branch,
 * commit message, short sha, author, how it started, or its pull request
 * (as "#14" or "pr 14"). Case does not matter.
 */
export function searchMatches(d: DeploymentView, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [
    d.projectName,
    d.branch,
    d.commit ?? "",
    d.sha ?? "",
    d.author ?? "",
    d.source,
    d.env,
    d.pr ? `#${d.pr} pr ${d.pr}` : "",
  ]
    .join("\n")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Deployments with no measured time (still running, never started) sort last either way. */
function byDuration(dir: 1 | -1) {
  return (a: DeploymentView, b: DeploymentView) => {
    if (a.durationMs === null && b.durationMs === null) return 0;
    if (a.durationMs === null) return 1;
    if (b.durationMs === null) return -1;
    return (a.durationMs - b.durationMs) * dir;
  };
}

export function applyDeploymentQuery(
  list: DeploymentView[],
  q: DeploymentQuery,
  now = Date.now()
): DeploymentView[] {
  const since = q.range === "any" ? null : now - RANGE_MS[q.range];
  const out = list.filter(
    (d) =>
      statusMatches(d, q.status) &&
      (q.env === "all" || d.env === q.env) &&
      (q.project === "all" || d.projectId === q.project) &&
      (since === null || new Date(d.createdAt).getTime() >= since) &&
      searchMatches(d, q.search)
  );
  const time = (d: DeploymentView) => new Date(d.createdAt).getTime();
  switch (q.sort) {
    case "newest":
      return out.sort((a, b) => time(b) - time(a));
    case "oldest":
      return out.sort((a, b) => time(a) - time(b));
    case "longest":
      return out.sort(byDuration(-1));
    case "shortest":
      return out.sort(byDuration(1));
  }
}

/** How many deployments each status pill would show, ignoring the status filter itself. */
export function statusCounts(
  list: DeploymentView[],
  q: DeploymentQuery,
  now = Date.now()
): Record<StatusFilter, number> {
  const base = applyDeploymentQuery(list, { ...q, status: "all" }, now);
  return {
    all: base.length,
    ready: base.filter((d) => statusMatches(d, "ready")).length,
    building: base.filter((d) => statusMatches(d, "building")).length,
    error: base.filter((d) => statusMatches(d, "error")).length,
  };
}

export function isDefaultQuery(q: DeploymentQuery): boolean {
  return (
    q.search.trim() === "" &&
    q.status === "all" &&
    q.env === "all" &&
    q.project === "all" &&
    q.range === "any" &&
    q.sort === "newest"
  );
}
