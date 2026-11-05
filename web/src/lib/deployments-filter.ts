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

// ------------------------------------------------------------ bulk actions

/** The few fields the bulk rules look at, so the server can check a database row too. */
export type BulkCandidate = {
  env: "production" | "preview";
  rawState: string;
  isCurrent: boolean;
  cleanedUp: boolean;
  createdAt: string | Date;
};

/** A preview counts as old once it is this old. */
export const OLD_PREVIEW_MS = 24 * 3_600_000;

const ACTIVE_STATES = ["queued", "building", "deploying"];

/**
 * Bulk actions only ever touch previews. Production releases and the live
 * release are never eligible, whatever their state.
 */
function bulkSafe(d: BulkCandidate): boolean {
  return d.env === "preview" && !d.isCurrent;
}

/** Bulk cancel: a preview that is still queued, building or deploying. */
export function canBulkCancel(d: BulkCandidate): boolean {
  return bulkSafe(d) && ACTIVE_STATES.includes(d.rawState);
}

/**
 * Bulk delete: an old preview that has finished (not running), is not live and
 * has not been cleaned up already. "Old" means at least OLD_PREVIEW_MS old.
 */
export function canBulkDelete(d: BulkCandidate, now = Date.now()): boolean {
  return (
    bulkSafe(d) &&
    !d.cleanedUp &&
    !ACTIVE_STATES.includes(d.rawState) &&
    now - new Date(d.createdAt).getTime() >= OLD_PREVIEW_MS
  );
}

/** What a selection allows, so the toolbar can show counts and disable buttons. */
export function bulkSummary(selected: BulkCandidate[], now = Date.now()) {
  return {
    cancel: selected.filter(canBulkCancel).length,
    delete: selected.filter((d) => canBulkDelete(d, now)).length,
  };
}

/** Compare needs exactly two rows. */
export function canCompare(selectedCount: number): boolean {
  return selectedCount === 2;
}

// ------------------------------------------------------------ compare

export type CompareRow = { label: string; a: string; b: string; differs: boolean };

const STATE_LABEL: Record<string, string> = {
  queued: "Queued",
  building: "Building",
  deploying: "Deploying",
  ready: "Ready",
  error: "Error",
  canceled: "Canceled",
};

function defaultCreated(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The rows of the side-by-side comparison, built only from what the list
 * already loaded. `differs` is true where the two values are not the same.
 */
export function compareRows(
  a: DeploymentView,
  b: DeploymentView,
  formatCreated: (iso: string) => string = defaultCreated
): CompareRow[] {
  const row = (label: string, x: string, y: string): CompareRow => ({
    label,
    a: x,
    b: y,
    differs: x !== y,
  });
  const sha = (d: DeploymentView) => (d.sha ? d.sha.slice(0, 7) : "None");
  const env = (d: DeploymentView) => (d.env === "preview" ? "Preview" : "Production");
  const state = (d: DeploymentView) => STATE_LABEL[d.rawState] ?? d.rawState;
  return [
    row("Branch", a.branch, b.branch),
    row("Commit SHA", sha(a), sha(b)),
    row("Commit message", a.commit ?? "None", b.commit ?? "None"),
    row("Environment", env(a), env(b)),
    row("State", state(a), state(b)),
    row("Duration", a.duration, b.duration),
    row("Created", formatCreated(a.createdAt), formatCreated(b.createdAt)),
    row("Live release", a.isCurrent ? "Yes" : "No", b.isCurrent ? "Yes" : "No"),
  ];
}
