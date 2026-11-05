import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { browserLabel, deleteAccount, listSessions, revokeOtherSessions, revokeSession } from "@/server/account";
import {
  analyticsSummary,
  cleanPath,
  cleanReferrer,
  enableAnalytics,
  recordPageview,
  visitorHash,
} from "@/server/analytics";
import { createSession, upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { addDomain, updateDomain } from "@/server/domains";
import { cpuPercentBetween } from "@/server/monitor";
import { createProject } from "@/server/projects";
import { createServer } from "@/server/servers";
import { incidentsFrom, publicStatus, uptimePercent, enableStatusPage } from "@/server/status-page";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherId: string;
let serverId: string;
let projectId: string;
let secondProjectId: string;

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  otherId = (await upsertUser({ id: "u2", name: "Alex", email: null, slackId: null })).id;
  serverId = (await createServer(userId, "sam-r")).id;
  const base = {
    serverId,
    repoUrl: "https://github.com/sam/app.git",
    runtime: "node" as const,
    port: 3000,
  };
  projectId = (await createProject(userId, { ...base, name: "App", slug: "app" })).id;
  secondProjectId = (await createProject(userId, { ...base, name: "Second", slug: "second", port: 3100 })).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

describe("analytics input cleaning", () => {
  it("keeps only the path", () => {
    expect(cleanPath("/pricing?utm=1#top")).toBe("/pricing");
    expect(cleanPath("/docs/")).toBe("/docs");
    expect(cleanPath("https://evil.example/x")).toBe("/");
    expect(cleanPath("")).toBe("/");
  });

  it("keeps only the referring host", () => {
    expect(cleanReferrer("https://www.news.example.com/post/1?id=9")).toBe("news.example.com");
    expect(cleanReferrer("javascript:alert(1)")).toBeNull();
    expect(cleanReferrer("not a url")).toBeNull();
    expect(cleanReferrer(undefined)).toBeNull();
  });

  it("changes the visitor id every day and for every project", () => {
    const a = { projectId: "p1", ip: "1.2.3.4", ua: "Firefox", day: "2026-11-04" };
    expect(visitorHash(a)).toBe(visitorHash({ ...a }));
    expect(visitorHash(a)).not.toBe(visitorHash({ ...a, day: "2026-11-05" }));
    expect(visitorHash(a)).not.toBe(visitorHash({ ...a, projectId: "p2" }));
  });
});

describe("analytics collection and summary", () => {
  it("counts page views and visitors, ignores bots and unknown keys", async () => {
    const { key } = await enableAnalytics(userId, projectId);
    const now = new Date("2026-11-04T12:00:00Z");
    const person = (ip: string) => ({ ip, ua: "Mozilla/5.0 Firefox" });

    expect(await recordPageview(key, { p: "/", r: "https://news.example.com/x" }, person("1.1.1.1"), now)).toBe(true);
    expect(await recordPageview(key, { p: "/about?x=1" }, person("2.2.2.2"), new Date(now.getTime() + 5_000))).toBe(true);
    // The same address inside a second is dropped, a later view is counted.
    expect(await recordPageview(key, { p: "/about" }, person("2.2.2.2"), new Date(now.getTime() + 5_200))).toBe(false);
    expect(await recordPageview(key, { p: "/about" }, person("2.2.2.2"), new Date(now.getTime() + 9_000))).toBe(true);
    expect(await recordPageview(key, { p: "/" }, { ip: "3.3.3.3", ua: "Googlebot/2.1" }, now)).toBe(false);
    expect(await recordPageview("nda_unknown", { p: "/" }, person("4.4.4.4"), now)).toBe(false);
    expect(await recordPageview("wrong", { p: "/" }, person("4.4.4.4"), now)).toBe(false);

    const s = await analyticsSummary(userId, projectId, 7, new Date("2026-11-04T23:00:00Z"));
    expect(s.views).toBe(3);
    expect(s.visitors).toBe(2);
    expect(s.daily).toHaveLength(7);
    expect(s.daily.at(-1)).toEqual({ day: "2026-11-04", views: 3, visitors: 2 });
    expect(s.daily[0].views).toBe(0);
    expect(s.pages[0]).toEqual({ path: "/about", views: 2 });
    expect(s.referrers).toEqual([{ host: "news.example.com", views: 1 }]);
  });

  it("does not show one user's analytics to another", async () => {
    await expect(analyticsSummary(otherId, projectId)).rejects.toThrow();
  });
});

describe("status page", () => {
  it("pairs outages and works out uptime from them", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 10, 4, 0, m));
    const incidents = incidentsFrom([
      { action: "monitor.down", at: at(10) },
      { action: "monitor.down", at: at(12) },
      { action: "monitor.up", at: at(30) },
      { action: "monitor.up", at: at(31) },
      { action: "monitor.down", at: at(50) },
    ]);
    expect(incidents).toHaveLength(2);
    expect(incidents[0]).toEqual({ from: at(10), to: at(30) });
    expect(incidents[1]).toEqual({ from: at(50), to: null });
    // 20 min down, then 10 min still down at minute 60: 30 of 60 minutes.
    expect(uptimePercent(incidents, at(0), at(60))).toBeCloseTo(50, 5);
    expect(uptimePercent([], at(0), at(60))).toBe(100);
  });

  it("publishes only what it should, and only while enabled", async () => {
    expect(await publicStatus("does-not-exist-123")).toBeNull();
    const { key } = await enableStatusPage(userId, projectId);
    const status = await publicStatus(key);
    expect(status).not.toBeNull();
    expect(status?.name).toBe("App");
    expect(status?.state).toBe("unknown");
    expect(status?.uptime).toBeNull();
    expect(Object.keys(status ?? {}).sort()).toEqual(
      ["days", "incidents", "name", "since", "state", "uptime", "windowDays"].sort()
    );
    // Each day in the strip is only a date, a state and a count of minutes.
    expect(status?.days.length).toBe(30);
    expect(Object.keys(status?.days[0] ?? {}).sort()).toEqual(["day", "downMinutes", "state"]);
  });
});

describe("cpuPercentBetween", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 10, 4, 0, 0, s));
  it("is the share of one core since the last sample", () => {
    // 3 seconds of CPU in 60 seconds is 5 percent.
    expect(cpuPercentBetween({ at: t(0), cpuNs: 1e9 }, { at: t(60), cpuNs: 4e9 })).toBe(5);
  });
  it("is null when it cannot be worked out honestly", () => {
    expect(cpuPercentBetween(undefined, { at: t(60), cpuNs: 4e9 })).toBeNull();
    expect(cpuPercentBetween({ at: t(0), cpuNs: 4e9 }, { at: t(60), cpuNs: 1e9 })).toBeNull(); // restarted
    expect(cpuPercentBetween({ at: t(0), cpuNs: 1e9 }, { at: t(3600), cpuNs: 4e9 })).toBeNull(); // long gap
    expect(cpuPercentBetween({ at: t(0), cpuNs: null }, { at: t(60), cpuNs: 4e9 })).toBeNull();
  });
});

describe("domain editing", () => {
  it("moves a domain to another project and port, and asks for the Nest change", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "app.example.com", port: 3000, projectId });
    const moved = await updateDomain(userId, domain.id, { projectId: secondProjectId });
    expect(moved.domain.projectId).toBe(secondProjectId);
    expect(moved.domain.port).toBe(3100); // follows the new project's port
    expect(moved.needsNestChange).toBe(true);
    expect(moved.domain.status).toBe("pending");

    const same = await updateDomain(userId, domain.id, { port: 3100 });
    expect(same.needsNestChange).toBe(false);

    const detached = await updateDomain(userId, domain.id, { projectId: null });
    expect(detached.domain.projectId).toBeNull();
  });

  it("refuses other people's domains and projects, and empty changes", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "mine.example.com", port: 3000 });
    await expect(updateDomain(otherId, domain.id, { port: 4000 })).rejects.toThrow();
    await expect(updateDomain(userId, domain.id, {})).rejects.toThrow();
    await expect(updateDomain(userId, domain.id, { projectId: "nope" })).rejects.toThrow();
  });
});

describe("account", () => {
  it("lists, revokes and bulk-revokes sessions without touching the current one", async () => {
    const a = await createSession(otherId, "Mozilla/5.0 (Windows NT 10.0) Chrome/130");
    const b = await createSession(otherId, "Mozilla/5.0 (iPhone) Safari/604");
    const c = await createSession(otherId, null);

    const list = await listSessions(otherId, a.token);
    expect(list).toHaveLength(3);
    expect(list.filter((s) => s.current)).toHaveLength(1);

    const other = list.find((s) => !s.current)!;
    await expect(revokeSession(otherId, list.find((s) => s.current)!.id, a.token)).rejects.toThrow();
    await expect(revokeSession(userId, other.id, undefined)).rejects.toThrow(); // not theirs
    await revokeSession(otherId, other.id, a.token);
    expect(await listSessions(otherId, a.token)).toHaveLength(2);

    expect(await revokeOtherSessions(otherId, a.token)).toBe(1);
    const left = await listSessions(otherId, a.token);
    expect(left).toHaveLength(1);
    expect(left[0].current).toBe(true);
    void b;
    void c;
  });

  it("names browsers readably", () => {
    expect(browserLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537")).toBe("Chrome on Windows");
    expect(browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604")).toBe("Safari on iOS");
    expect(browserLabel(null)).toBe("Unknown browser");
  });

  it("deletes everything under an account, but only when the name matches", async () => {
    const id = (await upsertUser({ id: "u3", name: "Robin", email: null, slackId: null })).id;
    await createServer(id, "robin-x");
    await expect(deleteAccount(id, "Robin", "robin")).rejects.toThrow();
    await expect(deleteAccount(id, "Robin", undefined)).rejects.toThrow();
    await deleteAccount(id, "Robin", "Robin");

    const { getDb } = await import("@/server/db");
    const db = await getDb();
    expect(await db.select().from(schema.users).where(eq(schema.users.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.servers).where(eq(schema.servers.userId, id))).toHaveLength(0);
  });
});
