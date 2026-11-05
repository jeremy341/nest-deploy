import { describe, expect, it } from "vitest";
import {
  applyDeploymentQuery,
  bulkSummary,
  canBulkCancel,
  canBulkDelete,
  canCompare,
  compareRows,
  DEFAULT_QUERY,
  isDefaultQuery,
  statusCounts,
} from "@/lib/deployments-filter";
import type { DeploymentView } from "@/server/queries";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function dep(over: Partial<DeploymentView>): DeploymentView {
  n++;
  return {
    id: `d${n}`,
    projectId: "p1",
    projectSlug: "recipe-api",
    projectName: "recipe-api",
    repo: "sam-r/recipe-api",
    env: "production",
    state: "ready",
    rawState: "ready",
    source: "webhook",
    branch: "main",
    sha: "abcdef1234",
    commit: "Add pagination",
    pr: null,
    author: "sam-r",
    age: "1h ago",
    duration: "30s",
    durationMs: 30_000,
    port: 3000,
    isCurrent: false,
    cleanedUp: false,
    error: null,
    createdAt: hoursAgo(1),
    ...over,
  };
}

const LIST = [
  dep({ id: "a", createdAt: hoursAgo(1), durationMs: 30_000 }),
  dep({
    id: "b",
    projectId: "p2",
    projectName: "pixel-garden",
    env: "preview",
    branch: "feat/water",
    commit: "Water animation",
    pr: 14,
    state: "building",
    durationMs: null,
    createdAt: hoursAgo(0.2),
  }),
  dep({ id: "c", state: "error", commit: "Fix flicker", author: "orpheus", durationMs: 90_000, createdAt: hoursAgo(30) }),
  dep({ id: "d", state: "canceled", durationMs: 5_000, createdAt: hoursAgo(24 * 10) }),
  dep({ id: "e", state: "queued", durationMs: null, createdAt: hoursAgo(0.1) }),
];

const ids = (q: Partial<typeof DEFAULT_QUERY>) =>
  applyDeploymentQuery(LIST, { ...DEFAULT_QUERY, ...q }, NOW).map((d) => d.id);

describe("deployments filter", () => {
  it("shows everything, newest first, by default", () => {
    expect(ids({})).toEqual(["e", "b", "a", "c", "d"]);
    expect(isDefaultQuery(DEFAULT_QUERY)).toBe(true);
  });

  it("groups statuses the way the pills do", () => {
    expect(ids({ status: "ready" })).toEqual(["a"]);
    expect(ids({ status: "building" })).toEqual(["e", "b"]); // building and queued
    expect(ids({ status: "error" })).toEqual(["c", "d"]); // error and canceled
  });

  it("filters by environment, project and time", () => {
    expect(ids({ env: "preview" })).toEqual(["b"]);
    expect(ids({ project: "p2" })).toEqual(["b"]);
    expect(ids({ range: "24h" })).toEqual(["e", "b", "a"]);
    expect(ids({ range: "7d" })).toEqual(["e", "b", "a", "c"]);
  });

  it("searches commit, branch, author, project and pull request, every word must match", () => {
    expect(ids({ search: "flicker" })).toEqual(["c"]);
    expect(ids({ search: "feat/water" })).toEqual(["b"]);
    expect(ids({ search: "orpheus" })).toEqual(["c"]);
    expect(ids({ search: "PIXEL" })).toEqual(["b"]);
    expect(ids({ search: "#14" })).toEqual(["b"]);
    expect(ids({ search: "pr 14" })).toEqual(["b"]);
    expect(ids({ search: "water garden" })).toEqual(["b"]);
    expect(ids({ search: "water orpheus" })).toEqual([]);
    expect(ids({ search: "   " })).toHaveLength(5);
  });

  it("sorts by build time with unfinished builds last in both directions", () => {
    const longest = ids({ sort: "longest" });
    expect(longest.slice(0, 3)).toEqual(["c", "a", "d"]);
    expect(longest.slice(3).sort()).toEqual(["b", "e"]);
    expect(ids({ sort: "shortest" }).slice(0, 3)).toEqual(["d", "a", "c"]);
    expect(ids({ sort: "oldest" })).toEqual(["d", "c", "a", "b", "e"]);
  });

  it("combines filters", () => {
    expect(ids({ status: "error", range: "7d" })).toEqual(["c"]);
    expect(isDefaultQuery({ ...DEFAULT_QUERY, search: "x" })).toBe(false);
  });

  it("counts each status without applying the status filter itself", () => {
    expect(statusCounts(LIST, DEFAULT_QUERY, NOW)).toEqual({ all: 5, ready: 1, building: 2, error: 2 });
    expect(statusCounts(LIST, { ...DEFAULT_QUERY, status: "error", env: "preview" }, NOW)).toEqual({
      all: 1,
      ready: 0,
      building: 1,
      error: 0,
    });
  });
});

describe("bulk eligibility", () => {
  const old = hoursAgo(48);
  const preview = (over: Partial<DeploymentView>) =>
    dep({ env: "preview", createdAt: old, ...over });

  it("cancels only previews that are queued, building or deploying", () => {
    expect(canBulkCancel(preview({ rawState: "queued" }))).toBe(true);
    expect(canBulkCancel(preview({ rawState: "building" }))).toBe(true);
    expect(canBulkCancel(preview({ rawState: "deploying" }))).toBe(true);
    expect(canBulkCancel(preview({ rawState: "ready" }))).toBe(false);
    expect(canBulkCancel(preview({ rawState: "error" }))).toBe(false);
    expect(canBulkCancel(preview({ rawState: "canceled" }))).toBe(false);
  });

  it("never cancels production or live releases", () => {
    expect(canBulkCancel(dep({ env: "production", rawState: "building" }))).toBe(false);
    expect(canBulkCancel(preview({ rawState: "building", isCurrent: true }))).toBe(false);
  });

  it("deletes only old, finished previews that are not live or cleaned up", () => {
    expect(canBulkDelete(preview({}), NOW)).toBe(true);
    expect(canBulkDelete(preview({ rawState: "error" }), NOW)).toBe(true);
    expect(canBulkDelete(preview({ createdAt: hoursAgo(2) }), NOW)).toBe(false);
    expect(canBulkDelete(preview({ createdAt: hoursAgo(24) }), NOW)).toBe(true);
    expect(canBulkDelete(preview({ cleanedUp: true }), NOW)).toBe(false);
    expect(canBulkDelete(preview({ isCurrent: true }), NOW)).toBe(false);
    expect(canBulkDelete(preview({ rawState: "building" }), NOW)).toBe(false);
  });

  it("never deletes production releases", () => {
    expect(canBulkDelete(dep({ env: "production", createdAt: old }), NOW)).toBe(false);
  });

  it("counts what a selection allows", () => {
    const sel = [
      preview({ rawState: "building" }),
      preview({}),
      dep({ env: "production", createdAt: old }),
    ];
    expect(bulkSummary(sel, NOW)).toEqual({ cancel: 1, delete: 1 });
  });

  it("compares only when exactly two are selected", () => {
    expect([0, 1, 2, 3].map(canCompare)).toEqual([false, false, true, false]);
  });
});

describe("compareRows", () => {
  const fmt = (iso: string) => iso.slice(0, 10);

  it("lists the fields in order and marks what differs", () => {
    const a = dep({ branch: "main", sha: "abcdef1234", commit: "One", isCurrent: true, createdAt: hoursAgo(1) });
    const b = dep({
      branch: "feature",
      sha: "abcdef1234",
      commit: "Two",
      env: "preview",
      rawState: "error",
      duration: "1m 2s",
      createdAt: hoursAgo(30),
    });
    const rows = compareRows(a, b, fmt);
    expect(rows.map((r) => r.label)).toEqual([
      "Branch",
      "Commit SHA",
      "Commit message",
      "Environment",
      "State",
      "Duration",
      "Created",
      "Live release",
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by["Commit SHA"]).toMatchObject({ a: "abcdef1", b: "abcdef1", differs: false });
    expect(by["Environment"]).toMatchObject({ a: "Production", b: "Preview", differs: true });
    expect(by["State"]).toMatchObject({ a: "Ready", b: "Error", differs: true });
    expect(by["Live release"]).toMatchObject({ a: "Yes", b: "No", differs: true });
  });

  it("shows None when a commit is missing", () => {
    const rows = compareRows(dep({ sha: null, commit: null }), dep({}), fmt);
    expect(rows[1].a).toBe("None");
    expect(rows[2].a).toBe("None");
  });
});
