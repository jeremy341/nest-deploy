import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/server/db";
import {
  bucketDaily,
  computeStats,
  formatCount,
  MIN_FINISHED,
  roundCount,
  roundDaily,
  successShare,
  windowStart,
} from "@/server/stats";
import { useFreshDb } from "@/server/test/db";

describe("roundCount", () => {
  it("shows anything under 10, including 0, as fewer than 10", () => {
    for (const n of [0, 1, 5, 9, 9.9]) expect(roundCount(n)).toEqual({ lessThan: 10 });
  });

  it("keeps two significant figures from 10 up", () => {
    expect(roundCount(10)).toEqual({ approx: 10 });
    expect(roundCount(47)).toEqual({ approx: 47 });
    expect(roundCount(99)).toEqual({ approx: 99 });
    expect(roundCount(100)).toEqual({ approx: 100 });
    expect(roundCount(104)).toEqual({ approx: 100 });
    expect(roundCount(105)).toEqual({ approx: 110 });
    expect(roundCount(1234)).toEqual({ approx: 1200 });
    expect(roundCount(9999)).toEqual({ approx: 10000 });
    expect(roundCount(1_234_567)).toEqual({ approx: 1_200_000 });
  });

  it("treats bad input as nothing", () => {
    expect(roundCount(-4)).toEqual({ lessThan: 10 });
    expect(roundCount(Number.NaN)).toEqual({ lessThan: 10 });
    expect(roundCount(Number.POSITIVE_INFINITY)).toEqual({ lessThan: 10 });
  });

  it("never reveals a figure with more than two significant digits", () => {
    for (let n = 10; n < 200_000; n += 37) {
      const c = roundCount(n);
      if (!("approx" in c)) throw new Error("expected a rounded value");
      expect(Number(String(c.approx).replace(/0+$/, "")) < 100).toBe(true);
    }
  });
});

describe("roundDaily", () => {
  it("keeps a day with nothing as an exact zero, but hides 1 to 9", () => {
    expect(roundDaily(0)).toEqual({ approx: 0 });
    expect(roundDaily(1)).toEqual({ lessThan: 10 });
    expect(roundDaily(9)).toEqual({ lessThan: 10 });
    expect(roundDaily(1234)).toEqual({ approx: 1200 });
  });
});

describe("formatCount", () => {
  it("writes the bound in words and groups large numbers", () => {
    expect(formatCount({ lessThan: 10 })).toBe("fewer than 10");
    expect(formatCount({ approx: 1200 })).toBe("1,200");
    expect(formatCount({ approx: 0 })).toBe("0");
  });
});

describe("bucketDaily", () => {
  const now = new Date("2026-11-05T14:30:00Z");

  it("returns one entry per UTC day, oldest first, ending today", () => {
    const out = bucketDaily([], now, 30);
    expect(out).toHaveLength(30);
    expect(out[0].date).toBe("2026-10-07");
    expect(out[29].date).toBe("2026-11-05");
    const dates = out.map((d) => d.date);
    expect(new Set(dates).size).toBe(30);
    expect([...dates].sort()).toEqual(dates);
  });

  it("fills days with no rows with zero", () => {
    const out = bucketDaily([{ day: "2026-11-03", n: 4 }], now, 5);
    expect(out).toEqual([
      { date: "2026-11-01", count: 0 },
      { date: "2026-11-02", count: 0 },
      { date: "2026-11-03", count: 4 },
      { date: "2026-11-04", count: 0 },
      { date: "2026-11-05", count: 0 },
    ]);
  });

  it("ignores rows outside the window and malformed days, and merges repeats", () => {
    const out = bucketDaily(
      [
        { day: "2026-09-01", n: 99 },
        { day: "2026-11-06", n: 99 },
        { day: "not a day", n: 99 },
        { day: "2026-11-05", n: 2 },
        { day: "2026-11-05", n: 3 },
      ],
      now,
      3
    );
    expect(out.map((d) => d.count)).toEqual([0, 0, 5]);
  });

  it("crosses a month and a year boundary", () => {
    const out = bucketDaily([], new Date("2027-01-02T00:00:00Z"), 4);
    expect(out.map((d) => d.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("starts the window at midnight UTC", () => {
    expect(windowStart(now, 30).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });
});

describe("successShare", () => {
  it("withholds the percentage under the minimum sample", () => {
    expect(successShare(30, 19)).toEqual({ percent: null, finished: 49 });
    expect(successShare(0, 0)).toEqual({ percent: null, finished: 0 });
  });

  it("gives a whole percent at the minimum", () => {
    expect(successShare(45, 5)).toEqual({ percent: 90, finished: MIN_FINISHED });
    expect(successShare(1, 2, 3)).toEqual({ percent: 33, finished: 3 });
  });

  it("does not round up to 100 while a failure exists, or down to 0 while a success exists", () => {
    expect(successShare(999, 1).percent).toBe(99);
    expect(successShare(1000, 0).percent).toBe(100);
    expect(successShare(1, 999).percent).toBe(1);
    expect(successShare(0, 60).percent).toBe(0);
  });
});

describe("computeStats", () => {
  let cleanup: () => Promise<void>;
  const now = new Date("2026-11-05T14:30:00Z");
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

  beforeAll(async () => {
    const fresh = await useFreshDb();
    cleanup = fresh.cleanup;
    const { db } = fresh;

    // 12 people, so the account count is a real number and gets rounded.
    for (let i = 0; i < 12; i++) {
      await db.insert(schema.users).values({
        id: `u${i}`,
        hackClubId: `hc-secret-${i}`,
        name: `Private Person ${i}`,
        email: `person${i}@private.example`,
        createdAt: day("2026-10-01"),
      });
    }
    const server = (id: string, userId: string, status: "connected" | "pending" | "error") =>
      db.insert(schema.servers).values({
        id,
        userId,
        nestUsername: `nest-${id}`,
        host: `${id}.private-host.example`,
        publicKey: "ssh-ed25519 AAAA",
        privateKeyEnc: "sealed",
        keyFingerprint: "SHA256:abc",
        status,
        createdAt: day("2026-10-01"),
      });
    await server("s1", "u0", "connected");
    await server("s2", "u1", "connected");
    await server("s3", "u2", "pending");
    await server("s4", "u3", "error");

    const project = (id: string, statusKey: string | null) =>
      db.insert(schema.projects).values({
        id,
        userId: "u0",
        serverId: "s1",
        slug: `slug-${id}`,
        name: `Secret Project ${id}`,
        repoUrl: `https://github.com/private-owner/repo-${id}`,
        runtime: "node",
        port: 3000,
        statusKey,
        createdAt: day("2026-10-01"),
        updatedAt: day("2026-10-01"),
      });
    await project("p1", "key-one");
    await project("p2", null);
    await project("p3", "key-three");

    let n = 0;
    const deploy = (projectId: string, state: "ready" | "error" | "canceled" | "queued", when: Date) =>
      db.insert(schema.deployments).values({
        id: `d${n++}`,
        projectId,
        env: "production",
        state,
        source: "manual",
        branch: "secret-branch",
        commitMessage: "secret commit message",
        port: 3000,
        releaseId: `r${n}`,
        createdAt: when,
      });
    // p1: 3 ready today, p2: one error only (never deployed), p3: ready 40 days ago (outside the window).
    for (let i = 0; i < 3; i++) await deploy("p1", "ready", day("2026-11-05"));
    await deploy("p1", "error", day("2026-11-04"));
    await deploy("p1", "canceled", day("2026-11-04"));
    await deploy("p1", "queued", day("2026-11-03"));
    await deploy("p2", "error", day("2026-11-01"));
    await deploy("p3", "ready", day("2026-09-20"));
  });
  afterAll(async () => {
    await cleanup();
  });

  it("counts each figure once and rounds it", async () => {
    const s = await computeStats(now);
    expect(s.accounts).toEqual({ approx: 12 });
    // Two connected servers, which is under 10.
    expect(s.serversConnected).toEqual({ lessThan: 10 });
    // p1 and p3 have a ready deployment; p1 has three but counts once.
    expect(s.projectsDeployed).toEqual({ lessThan: 10 });
    expect(s.statusPages).toEqual({ lessThan: 10 });
    expect(s.windowDays).toBe(30);
    expect(s.generatedAt).toBe(now.toISOString());
  });

  it("builds the 30 day series from all deployments, with zeros for quiet days", async () => {
    const s = await computeStats(now);
    const { daily, total } = s.deployments;
    expect(daily).toHaveLength(30);
    expect(daily[29]).toEqual({ date: "2026-11-05", count: { lessThan: 10 } });
    expect(daily[0]).toEqual({ date: "2026-10-07", count: { approx: 0 } });
    // 3 + 2 + 1 + 1 inside the window; the 40 day old one is left out. 7 is under 10.
    expect(total).toEqual({ lessThan: 10 });
  });

  it("withholds the success rate on a small sample", async () => {
    const s = await computeStats(now);
    expect(s.successRate.percent).toBeNull();
    expect(s.successRate.minimumFinished).toBe(50);
    expect(s.successRate.finished).toEqual({ lessThan: 10 });
  });

  it("contains nothing that identifies a person or a project", async () => {
    const json = JSON.stringify(await computeStats(now));
    for (const secret of [
      "Private Person",
      "private.example",
      "hc-secret",
      "Secret Project",
      "slug-p",
      "private-owner",
      "private-host",
      "nest-s",
      "secret-branch",
      "secret commit",
      "key-one",
      "key-three",
      "u0",
      "s1",
      "p1",
    ]) {
      expect(json).not.toContain(secret);
    }
    // Only these keys, so a new field has to be added on purpose.
    expect(Object.keys(JSON.parse(json)).sort()).toEqual([
      "accounts",
      "deployments",
      "generatedAt",
      "projectsDeployed",
      "serversConnected",
      "statusPages",
      "successRate",
      "windowDays",
    ]);
  });
});
