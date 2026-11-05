import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import {
  isHealthy,
  isSlow,
  nextMonitorState,
  planResourceAlerts,
  readResources,
  resourceMessage,
  type Reading,
  type ResourceKind,
} from "@/server/monitor";
import {
  alertOverview,
  alertSettingsInput,
  alertSettingsView,
  clearMute,
  type Fetcher,
  getAlerts,
  isMuted,
  muteFields,
  notifyDeploymentFinished,
  openAlert,
  pruneAlertEvents,
  resolveAlert,
  setAlertSettings,
  setMute,
  setNotifications,
} from "@/server/notify";
import { createProject, deployBranch, type ProjectRow } from "@/server/projects";
import { createServer } from "@/server/servers";
import { parseServiceStatus } from "@/server/service-status";
import { useFreshDb } from "@/server/test/db";

const LIMITS = { diskPct: 90, memoryPct: 90, cpuPct: 90 };
const usage = (over: Partial<Record<string, number | null>> = {}) => ({
  cpuLoad: 0.2,
  cpus: 4,
  memUsedMb: 400,
  memTotalMb: 1000,
  diskUsedMb: 5000,
  diskTotalMb: 10000,
  ...over,
});

const status = (lines: string[]) => parseServiceStatus(lines.join("\n"));
const running = ["ND_LoadState=loaded", "ND_ActiveState=active", "ND_SubState=running"];

describe("readResources", () => {
  it("reports each resource as a whole percent against its own limit", () => {
    const r = readResources(usage({ diskUsedMb: 9100 }), LIMITS);
    expect(r).toEqual([
      { kind: "disk", percent: 91, limit: 90, over: true },
      { kind: "memory", percent: 40, limit: 90, over: false },
      { kind: "cpu", percent: 5, limit: 90, over: false },
    ]);
  });

  it("treats the limit itself as a crossing but 89.9 as below it", () => {
    expect(readResources(usage({ diskUsedMb: 9000 }), LIMITS)[0]).toMatchObject({ percent: 90, over: true });
    expect(readResources(usage({ diskUsedMb: 8999 }), LIMITS)[0]).toMatchObject({ percent: 89, over: false });
  });

  it("uses load per core for CPU, so a busy 2 core box crosses at 1.8", () => {
    const busy = readResources(usage({ cpuLoad: 1.9, cpus: 2 }), LIMITS).find((x) => x.kind === "cpu");
    expect(busy).toMatchObject({ percent: 95, over: true });
    const calm = readResources(usage({ cpuLoad: 1.7, cpus: 2 }), LIMITS).find((x) => x.kind === "cpu");
    expect(calm?.over).toBe(false);
  });

  it("honours custom limits", () => {
    const r = readResources(usage({ memUsedMb: 600 }), { ...LIMITS, memoryPct: 60 });
    expect(r.find((x) => x.kind === "memory")?.over).toBe(true);
  });

  it("leaves out anything the probe could not read", () => {
    const r = readResources(
      usage({ diskUsedMb: null, memTotalMb: 0, cpuLoad: null }),
      LIMITS
    );
    expect(r).toEqual([]);
  });
});

describe("planResourceAlerts", () => {
  const over = (kind: ResourceKind, over = true): Reading => ({ kind, percent: over ? 95 : 50, limit: 90, over });

  it("fires on the first check over the limit", () => {
    const plan = planResourceAlerts([over("disk")], new Set());
    expect(plan.fire.map((r) => r.kind)).toEqual(["disk"]);
    expect(plan.resolve).toEqual([]);
  });

  it("stays quiet while the value stays over the limit", () => {
    const plan = planResourceAlerts([over("disk")], new Set<ResourceKind>(["disk"]));
    expect(plan).toEqual({ fire: [], resolve: [] });
  });

  it("announces once when it drops back below", () => {
    const plan = planResourceAlerts([over("disk", false)], new Set<ResourceKind>(["disk"]));
    expect(plan.resolve.map((r) => r.kind)).toEqual(["disk"]);
    expect(plan.fire).toEqual([]);
  });

  it("says nothing for a healthy value with no open alert", () => {
    expect(planResourceAlerts([over("cpu", false)], new Set())).toEqual({ fire: [], resolve: [] });
  });

  it("does not resolve a resource that has no reading this time", () => {
    expect(planResourceAlerts([], new Set<ResourceKind>(["memory"]))).toEqual({ fire: [], resolve: [] });
  });

  it("handles resources independently", () => {
    const plan = planResourceAlerts(
      [over("disk"), over("memory", false), over("cpu")],
      new Set<ResourceKind>(["memory", "cpu"])
    );
    expect(plan.fire.map((r) => r.kind)).toEqual(["disk"]);
    expect(plan.resolve.map((r) => r.kind)).toEqual(["memory"]);
  });

  it("writes plain messages", () => {
    expect(resourceMessage(over("disk"), "fire")).toBe("Disk on the server reached 95% (your limit is 90%).");
    expect(resourceMessage(over("cpu", false), "resolve")).toBe(
      "CPU load on the server is back below 90% (now 50%)."
    );
  });
});

describe("the down rule", () => {
  it("keeps two failed checks as the default", () => {
    const first = nextMonitorState({ state: "up", failures: 0 }, false);
    expect(first.change).toBeNull();
    expect(nextMonitorState(first, false).change).toBe("down");
  });

  it("can go down on the first failed check", () => {
    expect(nextMonitorState({ state: "up", failures: 0 }, false, 1).change).toBe("down");
  });

  it("waits for as many failures as asked, then fires once", () => {
    let s: { state: "up" | "down" | "unknown"; failures: number } = { state: "up", failures: 0 };
    const changes: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const t = nextMonitorState(s, false, 5);
      changes.push(t.change);
      s = t;
    }
    expect(changes).toEqual([null, null, null, null, "down", null, null]);
  });

  it("recovers with one good check whatever the limit", () => {
    expect(nextMonitorState({ state: "down", failures: 9 }, true, 10).change).toBe("up");
  });

  it("counts an answer slower than the limit as a failed check", () => {
    const slow = status([...running, "ND_HTTP=200 1.20"]);
    expect(isSlow(slow, 1000)).toBe(true);
    expect(isHealthy(slow, 1000)).toBe(false);
    expect(isHealthy(slow, 2000)).toBe(true);
    expect(isHealthy(slow, null)).toBe(true);
    expect(isHealthy(slow)).toBe(true);
  });

  it("ignores the limit when there is no timing", () => {
    expect(isHealthy(status(running), 100)).toBe(true);
    expect(isSlow(status([...running, "ND_HTTP=000 0.00"]), 100)).toBe(false);
  });
});

describe("mute windows", () => {
  const now = new Date("2026-03-01T12:00:00Z");

  it("is not muted by default", () => {
    expect(isMuted({ alertMutedUntil: null, alertMutedForever: false }, now)).toBe(false);
  });

  it("mutes for 1 hour, then stops exactly at the end", () => {
    const f = muteFields("1h", now);
    expect(f.alertMutedUntil?.toISOString()).toBe("2026-03-01T13:00:00.000Z");
    expect(isMuted(f, new Date("2026-03-01T12:59:59Z"))).toBe(true);
    expect(isMuted(f, new Date("2026-03-01T13:00:00Z"))).toBe(false);
  });

  it("mutes for 24 hours", () => {
    const f = muteFields("24h", now);
    expect(isMuted(f, new Date("2026-03-02T11:59:00Z"))).toBe(true);
    expect(isMuted(f, new Date("2026-03-02T12:00:01Z"))).toBe(false);
  });

  it("mutes until resumed with no end", () => {
    const f = muteFields("until_resumed", now);
    expect(f).toEqual({ alertMutedUntil: null, alertMutedForever: true });
    expect(isMuted(f, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("validation", () => {
  const bad = (v: unknown) => alertSettingsInput.safeParse(v).success;

  it("accepts whole percentages from 1 to 100", () => {
    expect(bad({ diskPct: 1, memoryPct: 75, cpuPct: 100 })).toBe(true);
    expect(bad({})).toBe(true);
  });

  it("rejects values above 100", () => {
    for (const k of ["diskPct", "memoryPct", "cpuPct"]) expect(bad({ [k]: 101 })).toBe(false);
  });

  it("rejects negatives and zero", () => {
    for (const k of ["diskPct", "memoryPct", "cpuPct"]) {
      expect(bad({ [k]: -1 })).toBe(false);
      expect(bad({ [k]: 0 })).toBe(false);
    }
  });

  it("rejects fractions, strings and non-numbers", () => {
    for (const v of [89.5, "90", Number.NaN, Infinity, null, true]) {
      expect(bad({ diskPct: v }), String(v)).toBe(false);
    }
  });

  it("limits failed checks to 1 through 10", () => {
    expect(bad({ failuresBeforeDown: 1 })).toBe(true);
    expect(bad({ failuresBeforeDown: 10 })).toBe(true);
    expect(bad({ failuresBeforeDown: 0 })).toBe(false);
    expect(bad({ failuresBeforeDown: 11 })).toBe(false);
    expect(bad({ failuresBeforeDown: 2.5 })).toBe(false);
  });

  it("allows null to switch the response time limit off", () => {
    expect(bad({ slowMs: null })).toBe(true);
    expect(bad({ slowMs: 1500 })).toBe(true);
    expect(bad({ slowMs: 10 })).toBe(false);
    expect(bad({ slowMs: 1500.5 })).toBe(false);
    expect(bad({ slowMs: -5 })).toBe(false);
    expect(bad({ slowMs: 100_000 })).toBe(false);
  });

  it("checks the channels are booleans", () => {
    expect(bad({ channels: { down: false } })).toBe(true);
    expect(bad({ channels: { down: "no" } })).toBe(false);
  });

  it("gives a plain message", () => {
    const r = alertSettingsInput.safeParse({ diskPct: 120 });
    expect(r.success ? "" : r.error.issues[0].message).toBe("The disk limit cannot be above 100.");
  });
});

// ------------------------------------------------------------ stored behaviour

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherUserId: string;
let project: ProjectRow;

const DISCORD = "https://discord.com/api/webhooks/123456789012345678/abc_DEF-123";
const okFetch: Fetcher = () => Promise.resolve(new Response(null, { status: 204 }));
const NOW = new Date("2026-03-01T12:00:00Z");

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "a1", name: "Sam", email: null, slackId: null })).id;
  otherUserId = (await upsertUser({ id: "a2", name: "Alex", email: null, slackId: null })).id;
  const serverId = (await createServer(userId, "sam-r")).id;
  project = await createProject(userId, {
    serverId,
    name: "Alerted",
    port: 3011,
    repoUrl: "https://github.com/example/demo",
    runtime: "node",
    startCommand: "node server.js",
  });
  await setNotifications(userId, project.id, { url: DISCORD, on: "all" });
});
afterAll(async () => {
  await ctx.cleanup();
});

const row = async () =>
  (await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get())!;
const events = () => ctx.db.select().from(schema.alertEvents).where(eq(schema.alertEvents.projectId, project.id));
const reset = async () => {
  await ctx.db.delete(schema.alertEvents).where(eq(schema.alertEvents.projectId, project.id));
  await ctx.db
    .update(schema.projects)
    .set({
      alertMutedUntil: null,
      alertMutedForever: false,
      alertOnDown: true,
      alertOnRecovery: true,
      alertOnResource: true,
      alertOnDeploy: true,
    })
    .where(eq(schema.projects.id, project.id));
};

describe("defaults", () => {
  it("match the old behaviour", async () => {
    const s = alertSettingsView(await row());
    expect(s).toEqual({
      diskPct: 90,
      memoryPct: 90,
      cpuPct: 90,
      failuresBeforeDown: 2,
      slowMs: null,
      channels: { down: true, recovery: true, resource: true, deploy: true },
      mute: { active: false, forever: false, until: null },
    });
  });
});

describe("firing and sending", () => {
  it("sends one message when it goes down and one when it recovers", async () => {
    await reset();
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "down", "The service is failed.", NOW, fetcher);
    await resolveAlert(await row(), "down", "It is answering again.", new Date(NOW.getTime() + 60_000), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetcher.mock.calls[0] as [string, RequestInit])[1].body));
    expect(first.content).toContain("Alerted is not answering");
    const second = JSON.parse(String((fetcher.mock.calls[1] as [string, RequestInit])[1].body));
    expect(second.content).toContain("Alerted is back up");
    const [e] = await events();
    expect(e).toMatchObject({ type: "down", muted: false });
    expect(e.resolvedAt?.getTime()).toBe(NOW.getTime() + 60_000);
  });

  it("sends resource warnings and the all-clear", async () => {
    await reset();
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "disk", "Disk on the server reached 93% (your limit is 90%).", NOW, fetcher);
    await resolveAlert(await row(), "disk", "Disk on the server is back below 90% (now 70%).", NOW, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String((fetcher.mock.calls[0] as [string, RequestInit])[1].body)).toContain("disk usage is high");
    expect(String((fetcher.mock.calls[1] as [string, RequestInit])[1].body)).toContain("back to normal");
  });

  it("respects the channel choices", async () => {
    await reset();
    await setAlertSettings(userId, project.id, { channels: { down: false, recovery: false, resource: false } });
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "down", "x", NOW, fetcher);
    await resolveAlert(await row(), "down", "y", NOW, fetcher);
    await openAlert(await row(), "memory", "z", NOW, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    // Still in the history, so people can see what happened.
    expect((await events()).map((e) => e.type).sort()).toEqual(["down", "memory"]);
  });

  it("can send recoveries but not outages", async () => {
    await reset();
    await setAlertSettings(userId, project.id, { channels: { down: false, recovery: true } });
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "down", "x", NOW, fetcher);
    await resolveAlert(await row(), "down", "y", NOW, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never throws when the webhook is broken", async () => {
    await reset();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = vi.fn(() => Promise.reject(new Error("network down")));
    await expect(openAlert(await row(), "cpu", "x", NOW, failing)).resolves.toBeUndefined();
    warn.mockRestore();
    expect(await events()).toHaveLength(1);
  });
});

describe("muting", () => {
  it("records events but sends nothing while muted", async () => {
    await reset();
    await setMute(userId, project.id, { duration: "1h" }, NOW);
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "down", "x", new Date(NOW.getTime() + 60_000), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    const [e] = await events();
    expect(e.muted).toBe(true);
  });

  it("does not announce a recovery for an outage the webhook never heard about", async () => {
    // Muted when it fired, then resumed before the outage ended.
    await reset();
    await setMute(userId, project.id, { duration: "24h" }, new Date());
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "down", "x", new Date(), fetcher);
    await clearMute(userId, project.id);
    await resolveAlert(await row(), "down", "y", new Date(), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    const [e] = await events();
    expect(e.resolvedAt).not.toBeNull();
  });

  it("sends again once the window has passed", async () => {
    await reset();
    await setMute(userId, project.id, { duration: "1h" }, NOW);
    const fetcher = vi.fn(okFetch);
    await openAlert(await row(), "disk", "x", new Date(NOW.getTime() + 61 * 60_000), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("resumes on request and reports the state", async () => {
    await reset();
    const muted = await setMute(userId, project.id, { duration: "until_resumed" });
    expect(muted.mute).toMatchObject({ active: true, forever: true, until: null });
    expect((await alertOverview(userId)).muted.map((m) => m.slug)).toEqual([project.slug]);
    const timed = await setMute(userId, project.id, { duration: "1h" });
    expect(timed.mute).toMatchObject({ active: true, forever: false });
    expect(timed.mute.until).not.toBeNull();
    const resumed = await clearMute(userId, project.id);
    expect(resumed.mute).toEqual({ active: false, forever: false, until: null });
    expect((await alertOverview(userId)).muted).toEqual([]);
  });

  it("rejects an unknown duration", async () => {
    await expect(setMute(userId, project.id, { duration: "1w" })).rejects.toBeTruthy();
  });
});

describe("deploy results", () => {
  async function finished(state: "ready" | "error") {
    const dep = await deployBranch(userId, project.id);
    await ctx.db
      .update(schema.deployments)
      .set({ state, startedAt: new Date(Date.now() - 5000), finishedAt: new Date(), error: state === "error" ? "boom" : null })
      .where(eq(schema.deployments.id, dep.id));
    return dep.id;
  }

  it("keeps the all and failures behaviour and records what was sent", async () => {
    await reset();
    await setNotifications(userId, project.id, { url: DISCORD, on: "failures" });
    const good = await finished("ready");
    const bad = await finished("error");
    const fetcher = vi.fn(okFetch);
    await notifyDeploymentFinished(good, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await notifyDeploymentFinished(bad, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "deploy", muted: false });
    await setNotifications(userId, project.id, { url: DISCORD, on: "all" });
  });

  it("is switched off by its channel", async () => {
    await reset();
    await setAlertSettings(userId, project.id, { channels: { deploy: false } });
    const fetcher = vi.fn(okFetch);
    await notifyDeploymentFinished(await finished("error"), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await events()).toHaveLength(0);
  });

  it("is recorded but not sent while muted", async () => {
    await reset();
    await setMute(userId, project.id, { duration: "1h" });
    const fetcher = vi.fn(okFetch);
    await notifyDeploymentFinished(await finished("ready"), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await events())[0]).toMatchObject({ type: "deploy", muted: true });
  });
});

describe("settings", () => {
  it("saves only the fields that were sent", async () => {
    await reset();
    await setAlertSettings(userId, project.id, { diskPct: 80, slowMs: 1500 });
    const s = await setAlertSettings(userId, project.id, { failuresBeforeDown: 4 });
    expect(s).toMatchObject({ diskPct: 80, memoryPct: 90, failuresBeforeDown: 4, slowMs: 1500 });
    const off = await setAlertSettings(userId, project.id, { slowMs: null });
    expect(off.slowMs).toBeNull();
    await setAlertSettings(userId, project.id, { diskPct: 90, failuresBeforeDown: 2 });
  });

  it("refuses bad values with a 400 and changes nothing", async () => {
    await expect(setAlertSettings(userId, project.id, { diskPct: 101 })).rejects.toBeTruthy();
    await expect(setAlertSettings(userId, project.id, { memoryPct: -3 })).rejects.toBeTruthy();
    await expect(setAlertSettings(userId, project.id, { cpuPct: 50.5 })).rejects.toBeTruthy();
    expect((await row()).alertDiskPct).toBe(90);
  });

  it("belongs to the owner", async () => {
    await expect(setAlertSettings(otherUserId, project.id, { diskPct: 80 })).rejects.toMatchObject({ status: 404 });
    await expect(setMute(otherUserId, project.id, { duration: "1h" })).rejects.toMatchObject({ status: 404 });
    await expect(getAlerts(otherUserId, project.id)).rejects.toMatchObject({ status: 404 });
  });

  it("feeds the lowest limits to the projects page", async () => {
    await setAlertSettings(userId, project.id, { diskPct: 70 });
    expect((await alertOverview(userId)).limits).toEqual({ diskPct: 70, memoryPct: 90, cpuPct: 90 });
    expect((await alertOverview(otherUserId)).limits).toEqual({ diskPct: 90, memoryPct: 90, cpuPct: 90 });
    await setAlertSettings(userId, project.id, { diskPct: 90 });
  });
});

describe("history", () => {
  it("lists newest first with ISO times", async () => {
    await reset();
    await openAlert(await row(), "cpu", "older", new Date("2026-03-01T10:00:00Z"), okFetch);
    await openAlert(await row(), "memory", "newer", new Date("2026-03-01T11:00:00Z"), okFetch);
    const { history } = await getAlerts(userId, project.id);
    expect(history.map((h) => h.message)).toEqual(["newer", "older"]);
    expect(history[0]).toMatchObject({ resolvedAt: null, firedAt: "2026-03-01T11:00:00.000Z" });
  });

  it("keeps 90 days, and keeps alerts that are still open", async () => {
    await reset();
    const now = new Date("2026-06-01T00:00:00Z");
    const day = 86_400_000;
    const add = (id: string, type: "down" | "deploy" | "disk", firedDays: number, resolvedDays: number | null) =>
      ctx.db.insert(schema.alertEvents).values({
        id,
        projectId: project.id,
        type,
        message: id,
        firedAt: new Date(now.getTime() - firedDays * day),
        resolvedAt: resolvedDays === null ? null : new Date(now.getTime() - resolvedDays * day),
        muted: false,
      });
    await add("old-resolved", "down", 120, 119);
    await add("recent-resolved", "down", 100, 89);
    await add("old-deploy", "deploy", 91, null);
    await add("new-deploy", "deploy", 89, null);
    await add("still-open", "disk", 200, null);
    await pruneAlertEvents(now);
    expect((await events()).map((e) => e.id).sort()).toEqual(["new-deploy", "recent-resolved", "still-open"]);
  });
});
