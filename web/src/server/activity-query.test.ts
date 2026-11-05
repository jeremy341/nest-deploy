import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { newId } from "@/server/crypto";
import { schema } from "@/server/db";
import { createProject } from "@/server/projects";
import { createServer } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";
import { DEFAULT_FILTERS, type ActivityFilters } from "./activity";
import { queryActivity } from "./activity-query";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string };
let other: { id: string };
let projectId: string;
let serverId: string;

const NOW = new Date("2026-11-05T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const f = (over: Partial<ActivityFilters> = {}): ActivityFilters => ({ ...DEFAULT_FILTERS, ...over });

async function row(
  userId: string | null,
  action: string,
  at: Date,
  target: string | null = null,
  meta: Record<string, unknown> | null = null
) {
  await ctx.db.insert(schema.auditLog).values({
    userId,
    action,
    target,
    meta: meta ? JSON.stringify(meta) : null,
    at,
  });
}

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "act-1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "act-2", name: "Kim", email: null, slackId: null });
  serverId = (await createServer(me.id, "sam-api")).id;
  projectId = (
    await createProject(me.id, {
      serverId,
      name: "Billing API",
      slug: "billing-api",
      port: 3000,
      repoUrl: "https://github.com/sam/billing.git",
      runtime: "node",
    })
  ).id;
  // createProject audits itself; start from a clean log so counts are exact.
  await ctx.db.delete(schema.auditLog);
});

afterAll(async () => {
  await ctx.cleanup();
});

describe("queryActivity", () => {
  it("returns only the signed-in user's entries, newest first, with readable fields", async () => {
    await row(me.id, "terminal.close", hoursAgo(2), projectId, { project: projectId, reason: "idle", seconds: 840 });
    await row(me.id, "deploy.redeploy", hoursAgo(1), projectId, { branch: "main" });
    await row(other.id, "deploy.redeploy", hoursAgo(1), projectId, { branch: "stolen" });

    const page = await queryActivity(me.id, f(), { now: NOW });
    expect(page.items.map((i) => i.action)).toEqual(["deploy.redeploy", "terminal.close"]);
    expect(page.total).toBe(2);

    const close = page.items[1];
    expect(close.label).toBe("Closed a terminal on");
    expect(close.target).toEqual({ name: "Billing API", href: "/projects/billing-api" });
    expect(close.suffix).toBe("after 14 minutes, reason: idle");
    expect(close.fields.map((x) => x.label)).toEqual(["Reason", "Duration"]);
    expect(close.kind).toBe("terminal");
    expect(close.token).toBeNull();
  });

  it("filters by kind on the server", async () => {
    await row(me.id, "domain.add", hoursAgo(3), projectId, { domain: "billing.example.com" });
    await row(me.id, "monitor.down", hoursAgo(4), projectId, { detail: "HTTP 502" });

    const domains = await queryActivity(me.id, f({ kind: "domains" }), { now: NOW });
    expect(domains.items.map((i) => i.action)).toEqual(["domain.add"]);
    expect(domains.total).toBe(1);

    const mon = await queryActivity(me.id, f({ kind: "monitoring" }), { now: NOW });
    expect(mon.items.map((i) => i.action)).toEqual(["monitor.down"]);
    expect(mon.items[0].tone).toBe("bad");

    const deployments = await queryActivity(me.id, f({ kind: "deployments" }), { now: NOW });
    expect(deployments.items.map((i) => i.action)).toEqual(["deploy.redeploy"]);
  });

  it("filters by date range", async () => {
    await row(me.id, "project.restart", hoursAgo(24 * 10), projectId);
    const all = await queryActivity(me.id, f(), { now: NOW });
    const week = await queryActivity(me.id, f({ range: "7d" }), { now: NOW });
    const day = await queryActivity(me.id, f({ range: "24h" }), { now: NOW });
    expect(all.items.some((i) => i.action === "project.restart")).toBe(true);
    expect(week.items.some((i) => i.action === "project.restart")).toBe(false);
    expect(day.items.every((i) => Date.parse(i.at) >= NOW.getTime() - 86_400_000)).toBe(true);
    expect(week.total).toBeLessThan(all.total!);
  });

  it("searches the label, the target name and the detail", async () => {
    const byLabel = await queryActivity(me.id, f({ q: "closed a terminal" }), { now: NOW });
    expect(byLabel.items.map((i) => i.action)).toEqual(["terminal.close"]);

    const byTarget = await queryActivity(me.id, f({ q: "billing api" }), { now: NOW });
    expect(byTarget.items.length).toBeGreaterThan(2);

    const byDetail = await queryActivity(me.id, f({ q: "502" }), { now: NOW });
    expect(byDetail.items.map((i) => i.action)).toEqual(["monitor.down"]);

    const byDomain = await queryActivity(me.id, f({ q: "billing.example.com" }), { now: NOW });
    expect(byDomain.items.map((i) => i.action)).toEqual(["domain.add"]);

    const none = await queryActivity(me.id, f({ q: "zzz-no-such-thing" }), { now: NOW });
    expect(none.items).toEqual([]);
    expect(none.nextCursor).toBeNull();
  });

  it("combines search with kind and range", async () => {
    const r = await queryActivity(me.id, f({ q: "billing", kind: "domains", range: "24h" }), { now: NOW });
    expect(r.items.map((i) => i.action)).toEqual(["domain.add"]);
    const miss = await queryActivity(me.id, f({ q: "billing", kind: "servers" }), { now: NOW });
    expect(miss.items).toEqual([]);
  });

  it("links a domain entry to the domain and keeps the project as a detail", async () => {
    const [d] = (await queryActivity(me.id, f({ kind: "domains" }), { now: NOW })).items;
    expect(d.target).toEqual({ name: "billing.example.com", href: "/domains" });
    expect(d.fields[0]).toEqual({ label: "Project", value: "Billing API", href: "/projects/billing-api" });
  });

  it("names a deleted project from what was recorded, or says it is gone", async () => {
    await row(me.id, "project.delete", hoursAgo(5), null, { name: "Old Site" });
    await row(me.id, "project.restart", hoursAgo(6), "gone-project-id");
    const page = await queryActivity(me.id, f({ q: "old site" }), { now: NOW });
    expect(page.items[0].target).toEqual({ name: "Old Site", href: null, gone: true });

    const restart = (await queryActivity(me.id, f({ q: "restarted" }), { now: NOW })).items.find(
      (i) => i.target?.gone
    );
    expect(restart?.target).toEqual({ name: "(deleted project)", href: null, gone: true });
    expect(JSON.stringify(restart)).not.toContain("gone-project-id");
  });

  it("shows the access token that made a change, by name, and never its id", async () => {
    const tokenId = newId();
    await ctx.db.insert(schema.apiTokens).values({
      id: tokenId,
      userId: me.id,
      name: "ci-deploy",
      prefix: "nd_abcd",
      hash: "h".repeat(64),
      scopes: JSON.stringify(["deployments:write"]),
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    await row(me.id, "deploy.trigger", hoursAgo(0.5), projectId, {
      branch: "main",
      env: "production",
      via: "api",
      token: tokenId,
    });
    const [e] = (await queryActivity(me.id, f({ q: "started a deployment" }), { now: NOW })).items;
    expect(e.token).toEqual({ name: "ci-deploy" });
    expect(e.label).toBe("Started a deployment of");
    expect(e.suffix).toBe("from branch main");
    expect(JSON.stringify(e)).not.toContain(tokenId);

    const byToken = await queryActivity(me.id, f({ q: "ci-deploy" }), { now: NOW });
    expect(byToken.items.map((i) => i.id)).toContain(e.id);

    await ctx.db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, tokenId));
    const [gone] = (await queryActivity(me.id, f({ q: "started a deployment" }), { now: NOW })).items;
    expect(gone.token).toEqual({ name: null });
  });

  it("never returns a secret, even if one was written into meta", async () => {
    await row(me.id, "project.update", hoursAgo(0.2), projectId, {
      fields: "branch",
      apiKey: "super-secret-value",
      note: "nd_3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c",
      webhook: "https://discord.com/api/webhooks/1/abc",
    });
    const page = await queryActivity(me.id, f({ q: "settings" }), { now: NOW });
    const json = JSON.stringify(page);
    expect(json).not.toContain("super-secret-value");
    expect(json).not.toContain("nd_3f9a8b7c");
    expect(json).not.toContain("discord.com");
    const hit = await queryActivity(me.id, f({ q: "super-secret-value" }), { now: NOW });
    expect(hit.items).toEqual([]);
  });

  it("pages with a cursor, 50 at a time, without repeats or gaps", async () => {
    await ctx.db.delete(schema.auditLog);
    const rows = Array.from({ length: 120 }, (_, i) => ({
      userId: me.id,
      action: "project.restart",
      target: projectId,
      meta: null,
      // Several rows share a second, to prove the id breaks the tie.
      at: new Date(NOW.getTime() - Math.floor(i / 3) * 1000),
    }));
    await ctx.db.insert(schema.auditLog).values(rows);

    const first = await queryActivity(me.id, f(), { now: NOW, limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(120);
    expect(first.nextCursor).not.toBeNull();

    const second = await queryActivity(me.id, f(), { now: NOW, limit: 50, cursor: first.nextCursor });
    const third = await queryActivity(me.id, f(), { now: NOW, limit: 50, cursor: second.nextCursor });
    expect(second.items).toHaveLength(50);
    expect(third.items).toHaveLength(20);
    expect(third.nextCursor).toBeNull();

    const all = [...first.items, ...second.items, ...third.items];
    expect(new Set(all.map((i) => i.id)).size).toBe(120);
    const sorted = [...all].sort((x, y) => Date.parse(y.at) - Date.parse(x.at) || y.id - x.id);
    expect(all.map((i) => i.id)).toEqual(sorted.map((i) => i.id));
  });

  it("pages a search too, and says when it has seen everything", async () => {
    const q = f({ q: "restarted" });
    const first = await queryActivity(me.id, q, { now: NOW, limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.total).toBeNull();
    const second = await queryActivity(me.id, q, { now: NOW, limit: 50, cursor: first.nextCursor });
    const third = await queryActivity(me.id, q, { now: NOW, limit: 50, cursor: second.nextCursor });
    expect(third.items).toHaveLength(20);
    expect(third.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...third.items].map((i) => i.id)).size).toBe(120);
  });

  it("ignores a malformed cursor", async () => {
    const page = await queryActivity(me.id, f(), { now: NOW, limit: 5, cursor: "bad; cursor" });
    expect(page.items).toHaveLength(5);
  });
});
