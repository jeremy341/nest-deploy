import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/server/db";
import {
  bucketDaily,
  bucketHours,
  bucketWeekdays,
  buildTimes,
  computeStats,
  formatCount,
  growthDirection,
  MIN_FINISHED,
  percentile,
  percentShare,
  roundBucket,
  roundCount,
  roundDaily,
  successShare,
  windowStart,
} from "@/server/stats";
import { formatDuration, formatHour } from "@/lib/stats-format";
import { useFreshDb } from "@/server/test/db";

const TOP_LEVEL_KEYS = [
  "accounts",
  "api",
  "buildTime",
  "deployments",
  "domainsMapped",
  "generatedAt",
  "growth",
  "monitoring",
  "projectsDeployed",
  "runtimes",
  "serversConnected",
  "statusPages",
  "successRate",
  "windowDays",
];

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
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(TOP_LEVEL_KEYS);
  });
});

describe("roundBucket", () => {
  it("hides every bucket under 10, including an empty one", () => {
    for (const n of [0, 1, 9]) expect(roundBucket(n)).toEqual({ lessThan: 10 });
    expect(roundBucket(10)).toEqual({ approx: 10 });
    expect(roundBucket(1234)).toEqual({ approx: 1200 });
    expect(roundBucket(Number.NaN)).toEqual({ lessThan: 10 });
  });
});

describe("bucketWeekdays", () => {
  it("puts Monday first and Sunday last", () => {
    // SQLite gives 0 for Sunday.
    const out = bucketWeekdays([
      { w: "0", n: 7 },
      { w: "1", n: 1 },
      { w: "6", n: 2 },
    ]);
    expect(out).toEqual([1, 0, 0, 0, 0, 2, 7]);
  });

  it("adds repeats and ignores unknown weekdays", () => {
    expect(
      bucketWeekdays([
        { w: 3, n: 2 },
        { w: "3", n: 3 },
        { w: "7", n: 99 },
        { w: "x", n: 99 },
        { w: "-1", n: 99 },
      ])
    ).toEqual([0, 0, 5, 0, 0, 0, 0]);
    expect(bucketWeekdays([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("bucketHours", () => {
  it("gives 24 buckets and ignores hours that do not exist", () => {
    const out = bucketHours([
      { h: "00", n: 4 },
      { h: "23", n: 6 },
      { h: "23", n: 1 },
      { h: "24", n: 99 },
      { h: "-1", n: 99 },
    ]);
    expect(out).toHaveLength(24);
    expect(out[0]).toBe(4);
    expect(out[23]).toBe(7);
    expect(out.reduce((a, b) => a + b, 0)).toBe(11);
  });
});

describe("percentShare", () => {
  it("withholds the percentage under 50 items and says how many there were", () => {
    expect(percentShare(30, 19)).toEqual({ percent: null, total: 49 });
    expect(percentShare(30, 20)).toEqual({ percent: 60, total: 50 });
  });

  it("does not round up to 100 or down to 0 while the other side is not empty", () => {
    expect(percentShare(999, 1).percent).toBe(99);
    expect(percentShare(1000, 0).percent).toBe(100);
    expect(percentShare(1, 999).percent).toBe(1);
    expect(percentShare(0, 60).percent).toBe(0);
  });

  it("treats negative input as nothing", () => {
    expect(percentShare(-5, 10)).toEqual({ percent: null, total: 10 });
  });
});

describe("percentile and buildTimes", () => {
  it("interpolates between neighbours and returns null for nothing", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20], 0.9)).toBe(19);
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 1)).toBe(3);
    // Out of range clamps rather than reading past the list.
    expect(percentile([1, 2, 3], 2)).toBe(3);
    expect(percentile([1, 2, 3], -1)).toBe(1);
  });

  it("works on 1 to 100 seconds the way the textbook does", () => {
    const ms = Array.from({ length: 100 }, (_, i) => (i + 1) * 1000);
    // rank 0.5 * 99 = 49.5 gives 50.5 s; rank 0.9 * 99 = 89.1 gives 90.1 s
    expect(buildTimes(ms)).toEqual({ sample: 100, medianSeconds: 51, p90Seconds: 90 });
  });

  it("does not need the input sorted", () => {
    const ms = Array.from({ length: 60 }, (_, i) => (i + 1) * 1000).reverse();
    expect(buildTimes(ms).medianSeconds).toBe(31);
  });

  it("withholds both figures under 50 builds but still says how many it saw", () => {
    const ms = Array.from({ length: 49 }, () => 5000);
    expect(buildTimes(ms)).toEqual({ sample: 49, medianSeconds: null, p90Seconds: null });
    expect(buildTimes([])).toEqual({ sample: 0, medianSeconds: null, p90Seconds: null });
    expect(buildTimes(Array.from({ length: 50 }, () => 5000)).medianSeconds).toBe(5);
  });

  it("leaves out bad rows, so they cannot make up the sample", () => {
    const good = Array.from({ length: 49 }, () => 5000);
    const bad = [-1, Number.NaN, Number.POSITIVE_INFINITY, -10_000];
    expect(buildTimes([...good, ...bad]).sample).toBe(49);
    expect(buildTimes([...good, ...bad]).medianSeconds).toBeNull();
    expect(buildTimes([...good, 5000, ...bad]).sample).toBe(50);
  });

  it("rounds to whole seconds, half up", () => {
    const same = (ms: number) => buildTimes(Array.from({ length: 50 }, () => ms));
    expect(same(1499).medianSeconds).toBe(1);
    expect(same(1500).medianSeconds).toBe(2);
    expect(same(0).medianSeconds).toBe(0);
  });
});

describe("growthDirection", () => {
  it("gives only a direction when either week is under 10", () => {
    expect(growthDirection(9, 0)).toEqual({ direction: "up", percentChange: null });
    expect(growthDirection(0, 9)).toEqual({ direction: "down", percentChange: null });
    expect(growthDirection(5, 9)).toEqual({ direction: "down", percentChange: null });
    expect(growthDirection(40, 3)).toEqual({ direction: "up", percentChange: null });
  });

  it("calls a gap under 3 about the same when a side is small, so one sign-up is not growth", () => {
    expect(growthDirection(0, 0).direction).toBe("same");
    expect(growthDirection(1, 0).direction).toBe("same");
    expect(growthDirection(2, 0).direction).toBe("same");
    expect(growthDirection(3, 0).direction).toBe("up");
    expect(growthDirection(0, 2).direction).toBe("same");
    expect(growthDirection(0, 3).direction).toBe("down");
    expect(growthDirection(11, 9).direction).toBe("same");
  });

  it("uses a 10 percent band on the rounded counts when both are at least 10", () => {
    expect(growthDirection(10, 10).direction).toBe("same");
    expect(growthDirection(21, 20).direction).toBe("same");
    expect(growthDirection(22, 20).direction).toBe("up");
    expect(growthDirection(18, 20).direction).toBe("down");
    expect(growthDirection(19, 20).direction).toBe("same");
    // 1,234 and 1,200 both round to 1,200, so there is no change to report.
    expect(growthDirection(1234, 1200).direction).toBe("same");
  });

  it("adds a whole percent only when both weeks have at least 50", () => {
    expect(growthDirection(30, 20)).toEqual({ direction: "up", percentChange: null });
    expect(growthDirection(49, 60).percentChange).toBeNull();
    expect(growthDirection(60, 50)).toEqual({ direction: "up", percentChange: 20 });
    expect(growthDirection(50, 100)).toEqual({ direction: "down", percentChange: -50 });
    expect(growthDirection(52, 50)).toEqual({ direction: "same", percentChange: 4 });
  });

  it("computes the percent from the rounded counts, not the exact ones", () => {
    // 1,234 rounds to 1,200 and 1,051 to 1,100: (1200 - 1100) / 1100 is 9.09 percent.
    expect(growthDirection(1234, 1051)).toEqual({ direction: "same", percentChange: 9 });
  });

  it("treats bad input as nothing", () => {
    expect(growthDirection(-4, Number.NaN).direction).toBe("same");
  });
});

describe("stats formatting helpers", () => {
  it("writes whole seconds as a short duration", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(59)).toBe("59 s");
    expect(formatDuration(60)).toBe("1 min 00 s");
    expect(formatDuration(334)).toBe("5 min 34 s");
    expect(formatDuration(3600)).toBe("1 h 00 min");
    expect(formatDuration(-5)).toBe("0 s");
  });

  it("writes an hour as the start of a UTC hour", () => {
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(23)).toBe("23:00");
  });
});

/** Collect every key and every string in a JSON value. */
function leaves(value: unknown, out: { keys: string[]; strings: string[] } = { keys: [], strings: [] }) {
  if (Array.isArray(value)) value.forEach((v) => leaves(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.keys.push(k);
      leaves(v, out);
    }
  } else if (typeof value === "string") out.strings.push(value);
  return out;
}

describe("computeStats, the richer figures", () => {
  let cleanup: () => Promise<void>;
  const now = new Date("2026-11-05T14:30:00Z");
  const at = (iso: string) => new Date(iso);
  const oldTz = process.env.TZ;

  beforeAll(async () => {
    // A zone 13 hours ahead of UTC: code that used local weekdays or hours would put
    // the evening deployments below on the wrong day.
    process.env.TZ = "Pacific/Auckland";
    const fresh = await useFreshDb();
    cleanup = fresh.cleanup;
    const { db } = fresh;
    const created = at("2026-09-01T10:00:00Z");

    // 115 accounts: 60 this week, 50 the week before, 5 older.
    const users: (typeof schema.users.$inferInsert)[] = [];
    const person = (i: number, when: string) =>
      users.push({
        id: `user-${i}`,
        hackClubId: `hc-secret-${i}`,
        name: `Hidden Person ${i}`,
        email: `hidden${i}@secret-mail.example`,
        createdAt: at(when),
      });
    let u = 0;
    for (let i = 0; i < 60; i++) person(u++, "2026-11-03T12:00:00Z");
    for (let i = 0; i < 50; i++) person(u++, "2026-10-27T12:00:00Z");
    for (let i = 0; i < 5; i++) person(u++, "2026-09-01T12:00:00Z");
    await db.insert(schema.users).values(users);

    await db.insert(schema.servers).values({
      id: "srv-secret",
      userId: "user-0",
      nestUsername: "nest-secret-name",
      host: "box.secret-host.example",
      publicKey: "ssh-ed25519 AAAA",
      privateKeyEnc: "sealed",
      keyFingerprint: "SHA256:abc",
      status: "connected",
      createdAt: created,
    });

    // Runtimes: 60 node, 12 python, 1 static, 0 command.
    // Monitoring: node 52 up / 5 down / 3 never checked, python 12 up, static 1 down.
    const projects: (typeof schema.projects.$inferInsert)[] = [];
    const project = (i: number, runtime: "node" | "python" | "static", monitorState: "up" | "down" | "unknown") =>
      projects.push({
        id: `proj-secret-${i}`,
        userId: "user-0",
        serverId: "srv-secret",
        slug: `slug-secret-${i}`,
        name: `Recipe Pixel Standup ${i}`,
        repoUrl: `https://github.com/sam-r/hackatime-${i}`,
        runtime,
        port: 3000 + i,
        monitorState,
        createdAt: created,
        updatedAt: created,
      });
    let p = 0;
    for (let i = 0; i < 52; i++) project(p++, "node", "up");
    for (let i = 0; i < 5; i++) project(p++, "node", "down");
    for (let i = 0; i < 3; i++) project(p++, "node", "unknown");
    for (let i = 0; i < 12; i++) project(p++, "python", "up");
    project(p++, "static", "down");
    await db.insert(schema.projects).values(projects);

    // 12 valid domains, 3 not yet.
    const domains: (typeof schema.domains.$inferInsert)[] = [];
    for (let i = 0; i < 15; i++)
      domains.push({
        id: `dom-${i}`,
        userId: "user-0",
        serverId: "srv-secret",
        domain: `secret-${i}.private-domain.example`,
        port: 3000,
        status: i < 12 ? "valid" : "pending",
        createdAt: created,
      });
    await db.insert(schema.domains).values(domains);

    // 63 tokens: 0..54 live, 55..57 revoked, 58..62 expired. So 55 are active.
    const tokens: (typeof schema.apiTokens.$inferInsert)[] = [];
    for (let i = 0; i < 63; i++)
      tokens.push({
        id: `tok-secret-${i}`,
        userId: "user-0",
        name: `My secret token ${i}`,
        prefix: `ndp_SECRET${i}`,
        hash: `hash-secret-${i}`,
        scopes: '["deployments:write"]',
        createdAt: created,
        expiresAt: i < 58 ? at("2027-03-01T00:00:00Z") : at("2026-10-01T00:00:00Z"),
        revokedAt: i >= 55 && i < 58 ? at("2026-10-15T00:00:00Z") : null,
      });
    await db.insert(schema.apiTokens).values(tokens);

    // 14 API deploys in the window, 6 from the dashboard, 3 API ones before the window,
    // and 20 other API events that are not deployments.
    const audits: (typeof schema.auditLog.$inferInsert)[] = [];
    const audit = (action: string, meta: string, when: string) =>
      audits.push({ userId: "user-0", action, target: "proj-secret-0", meta, at: at(when) });
    for (let i = 0; i < 14; i++) audit("deploy.trigger", '{"branch":"secret-branch","via":"api","token":"tok-secret-1"}', "2026-11-02T10:00:00Z");
    for (let i = 0; i < 6; i++) audit("deploy.trigger", '{"via":"ui"}', "2026-11-02T10:00:00Z");
    for (let i = 0; i < 3; i++) audit("deploy.trigger", '{"via":"api"}', "2026-09-02T10:00:00Z");
    for (let i = 0; i < 20; i++) audit("token.create", '{"via":"api"}', "2026-11-02T10:00:00Z");
    await db.insert(schema.auditLog).values(audits);

    // Deployments. 2026-11-01 is a Sunday (UTC), 2026-11-05 a Thursday.
    const deps: (typeof schema.deployments.$inferInsert)[] = [];
    let n = 0;
    const deploy = (
      state: "ready" | "error" | "canceled" | "queued",
      env: "production" | "preview",
      when: string,
      seconds: number | null
    ) => {
      const made = at(when);
      deps.push({
        id: `dep-secret-${n++}`,
        projectId: "proj-secret-0",
        env,
        state,
        source: "manual",
        branch: "secret-branch",
        commitMessage: "secret commit message",
        author: "secret-author",
        port: 3000,
        releaseId: `rel-secret-${n}`,
        createdAt: made,
        startedAt: seconds === null ? null : made,
        finishedAt: seconds === null ? null : new Date(made.getTime() + seconds * 1000),
      });
    };
    // Sunday 23:30 UTC (Monday 12:30 in Auckland): 12 production, 30 s each.
    for (let i = 0; i < 12; i++) deploy("ready", "production", "2026-11-01T23:30:00Z", 30);
    // Monday 00:30 UTC (Monday 13:30 in Auckland): 11 preview, 60 s each.
    for (let i = 0; i < 11; i++) deploy("ready", "preview", "2026-11-02T00:30:00Z", 60);
    // Tuesday 14:00 UTC: 30 production, 100 s to 390 s.
    for (let i = 0; i < 30; i++) deploy("ready", "production", "2026-11-03T14:00:00Z", 100 + i * 10);
    // Wednesday 09:00 UTC: 4 failed previews, 10 s each.
    for (let i = 0; i < 4; i++) deploy("error", "preview", "2026-11-04T09:00:00Z", 10);
    // One canceled (Friday 30 Oct 08:00) and one still queued (Thursday 10:00).
    deploy("canceled", "production", "2026-10-30T08:00:00Z", null);
    deploy("queued", "production", "2026-11-05T10:00:00Z", null);
    // The last second before the window opens: not counted anywhere in the 30 day figures.
    deploy("ready", "production", "2026-10-06T23:59:59Z", 999_999);
    await db.insert(schema.deployments).values(deps);
  });
  afterAll(async () => {
    await cleanup();
    if (oldTz === undefined) delete process.env.TZ;
    else process.env.TZ = oldTz;
  });

  it("counts growth, domains and tokens, each rounded", async () => {
    const s = await computeStats(now);
    // 115 accounts, which is 120 to two significant figures.
    expect(s.accounts).toEqual({ approx: 120 });
    expect(s.growth).toEqual({
      windowDays: 7,
      last: { approx: 60 },
      previous: { approx: 50 },
      direction: "up",
      percentChange: 20,
      minimumForPercent: 50,
    });
    expect(s.domainsMapped).toEqual({ approx: 12 });
    expect(s.api.tokensActive).toEqual({ approx: 55 });
    // Only deploy.trigger rows with via api, and only inside the window.
    expect(s.api.deploymentsViaApi).toEqual({ approx: 14 });
  });

  it("splits deployments by outcome and environment, hiding small counts", async () => {
    const s = await computeStats(now);
    expect(s.deployments.outcomes).toEqual({ ready: { approx: 53 }, error: { lessThan: 10 }, canceled: { lessThan: 10 } });
    // 12 + 30 + the canceled and queued ones; and 11 + 4. The one before the window is out.
    expect(s.deployments.byEnvironment).toEqual({ production: { approx: 44 }, preview: { approx: 15 } });
    expect(s.deployments.total).toEqual({ approx: 59 });
    // 53 ready, 4 failed: 57 finished, 93 percent.
    expect(s.successRate).toEqual({ percent: 93, finished: { approx: 57 }, minimumFinished: 50 });
  });

  it("buckets weekdays in UTC, Monday first, whatever the server's own time zone", async () => {
    const s = await computeStats(now);
    expect(s.deployments.byWeekday.map((b) => b.weekday)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    const by = Object.fromEntries(s.deployments.byWeekday.map((b) => [b.weekday, b.count]));
    expect(by.Sunday).toEqual({ approx: 12 });
    expect(by.Monday).toEqual({ approx: 11 });
    expect(by.Tuesday).toEqual({ approx: 30 });
    // 4 failed, 1 queued, 1 canceled and none at all are all "fewer than 10", never a value or a zero.
    for (const day of ["Wednesday", "Thursday", "Friday", "Saturday"]) expect(by[day]).toEqual({ lessThan: 10 });
  });

  it("buckets hours in UTC and shows no value for a bucket under the minimum", async () => {
    const s = await computeStats(now);
    const { minimumBucket, buckets } = s.deployments.byHour;
    expect(minimumBucket).toBe(10);
    expect(buckets).toHaveLength(24);
    expect(buckets.map((b) => b.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    const by = (h: number) => buckets[h].count;
    expect(by(23)).toEqual({ approx: 12 });
    expect(by(0)).toEqual({ approx: 11 });
    expect(by(14)).toEqual({ approx: 30 });
    // 09:00 has 4, 08:00 and 10:00 have 1: all hidden.
    for (const h of [8, 9, 10]) expect(by(h)).toEqual({ lessThan: 10 });
    for (const b of buckets) {
      if ("lessThan" in b.count) expect(b.count).toEqual({ lessThan: 10 });
      else expect(b.count.approx).toBeGreaterThanOrEqual(10);
    }
  });

  it("works out the median and 90th percentile build time from the finished rows in the window", async () => {
    const s = await computeStats(now);
    // 27 builds of 10, 30 or 60 s, then 100 to 390 s: 57 in all. Rank 28 is 110 s;
    // rank 50.4 lies between 330 s and 340 s. The queued, canceled and out of window rows are not used.
    expect(s.buildTime).toEqual({ finished: { approx: 57 }, minimumFinished: 50, medianSeconds: 110, p90Seconds: 334 });
  });

  it("lists every runtime in a fixed order and hides small ones", async () => {
    const s = await computeStats(now);
    expect(s.runtimes).toEqual([
      { runtime: "node", count: { approx: 60 } },
      { runtime: "python", count: { approx: 12 } },
      { runtime: "static", count: { lessThan: 10 } },
      { runtime: "command", count: { lessThan: 10 } },
    ]);
  });

  it("gives the share of checked projects that were up, with its denominator", async () => {
    const s = await computeStats(now);
    // 64 up and 6 down: 70 checked (the 3 never checked are not counted), 91 percent.
    expect(s.monitoring).toEqual({ checked: { approx: 70 }, minimumChecked: 50, upPercent: 91 });
  });

  it("contains nothing that identifies a person or a project, in its keys or its values", async () => {
    const stats = await computeStats(now);
    const json = JSON.stringify(stats);
    for (const secret of [
      "Hidden Person",
      "secret-mail",
      "hc-secret",
      "secret-host",
      "nest-secret",
      "srv-secret",
      "proj-secret",
      "slug-secret",
      "Recipe",
      "Pixel",
      "Standup",
      "sam-r",
      "hackatime",
      "github",
      "private-domain",
      "My secret token",
      "ndp_SECRET",
      "hash-secret",
      "tok-secret",
      "secret-branch",
      "secret commit",
      "secret-author",
      "rel-secret",
      "user-0",
      "dep-secret",
    ]) {
      expect(json).not.toContain(secret);
    }
    // Nothing that looks like an address, a link or a host.
    expect(json).not.toMatch(/@|https?:|\.com|\.example|localhost/i);

    const parsed = JSON.parse(json);
    expect(Object.keys(parsed).sort()).toEqual(TOP_LEVEL_KEYS);

    // Every key is one of the known names, so a new field has to be added on purpose.
    const { keys, strings } = leaves(parsed);
    const allowedKeys = new Set([
      ...TOP_LEVEL_KEYS,
      "approx", "lessThan", "date", "count", "daily", "total", "outcomes", "ready", "error", "canceled",
      "byEnvironment", "production", "preview", "byWeekday", "weekday", "byHour", "minimumBucket", "buckets", "hour",
      "percent", "finished", "minimumFinished", "medianSeconds", "p90Seconds", "last", "previous", "direction",
      "percentChange", "minimumForPercent", "tokensActive", "deploymentsViaApi", "runtime", "checked", "minimumChecked", "upPercent",
    ]);
    for (const k of keys) expect(allowedKeys.has(k), `unexpected key ${k}`).toBe(true);

    // Every string is a date, a timestamp, or one of a closed set of words.
    const words = new Set([
      "up", "down", "same", "node", "python", "static", "command",
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    for (const str of strings) {
      const ok = words.has(str) || /^\d{4}-\d{2}-\d{2}$/.test(str) || str === stats.generatedAt;
      expect(ok, `unexpected string ${str}`).toBe(true);
    }

    // Every rounded count keeps at most two significant figures.
    for (const c of [stats.accounts, stats.deployments.total, stats.growth.last, stats.api.tokensActive]) {
      if ("approx" in c) expect(Number(String(c.approx).replace(/0+$/, "")) < 100).toBe(true);
    }
  });
});
