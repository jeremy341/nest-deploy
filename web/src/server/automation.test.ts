import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { createDeployHook, revokeDeployHook, triggerDeployHook } from "@/server/hooks";
import {
  clearNotifications,
  type Fetcher,
  notifyDeploymentFinished,
  parseNotifyUrl,
  sendTestNotification,
  setNotifications,
} from "@/server/notify";
import { createProject, deployBranch, type ProjectRow } from "@/server/projects";
import { projectViews } from "@/server/queries";
import { createServer } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherUserId: string;
let serverId: string;
let project: ProjectRow;

const base = {
  repoUrl: "https://github.com/example/demo",
  runtime: "node" as const,
  startCommand: "node server.js",
};

const DISCORD = "https://discord.com/api/webhooks/123456789012345678/abc_DEF-123";
const SLACK = "https://hooks.slack.com/services/T0000/B0000/XXXXXXXXXXXX";

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  otherUserId = (await upsertUser({ id: "u2", name: "Alex", email: null, slackId: null })).id;
  serverId = (await createServer(userId, "sam-r")).id;
  project = await createProject(userId, { ...base, serverId, name: "Hooked", port: 3010 });
});
afterAll(async () => {
  await ctx.cleanup();
});

async function finish(id: string, state: "ready" | "error", extra: Record<string, unknown> = {}) {
  await ctx.db
    .update(schema.deployments)
    .set({ state, startedAt: new Date(Date.now() - 48_000), finishedAt: new Date(), ...extra })
    .where(eq(schema.deployments.id, id));
}

describe("deploy hooks", () => {
  it("stores only a hash and starts a production deployment", async () => {
    const { token, url } = await createDeployHook(userId, project.id);
    expect(token.startsWith("ndh_")).toBe(true);
    expect(url.endsWith(`/api/hooks/deploy/${token}`)).toBe(true);

    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get();
    expect(row?.hookHash).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(token);

    const dep = await triggerDeployHook(token, {});
    expect(dep).toMatchObject({ env: "production", source: "hook", branch: "main", state: "queued" });
    expect(dep.commitMessage).toBe("Triggered by deploy hook");
  });

  it("refuses a second trigger while one is running", async () => {
    // The deployment above is still queued.
    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get();
    expect(row?.hookHash).toBeTruthy();
    const { token } = await createDeployHook(userId, project.id);
    await expect(triggerDeployHook(token, {})).rejects.toMatchObject({ status: 409, code: "busy" });
    // Let it finish, then it works again and may name a preview branch.
    await ctx.db.update(schema.deployments).set({ state: "ready" }).where(eq(schema.deployments.projectId, project.id));
    const dep = await triggerDeployHook(token, { branch: "feature/x" });
    expect(dep).toMatchObject({ env: "preview", branch: "feature/x" });
    await ctx.db.update(schema.deployments).set({ state: "ready" }).where(eq(schema.deployments.projectId, project.id));
  });

  it("rejects bad branches, bad bodies and unknown tokens the same way", async () => {
    const { token } = await createDeployHook(userId, project.id);
    await expect(triggerDeployHook(token, { branch: "../etc" })).rejects.toMatchObject({ status: 400 });
    await expect(triggerDeployHook(token, { branch: "-x" })).rejects.toMatchObject({ status: 400 });
    await expect(triggerDeployHook(token, { other: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(triggerDeployHook("ndh_nope", {})).rejects.toMatchObject({ status: 404 });
    await expect(triggerDeployHook("nope", {})).rejects.toMatchObject({ status: 404 });
  });

  it("replacing the hook kills the old URL, revoking kills the new one", async () => {
    const first = await createDeployHook(userId, project.id);
    const second = await createDeployHook(userId, project.id);
    await expect(triggerDeployHook(first.token, {})).rejects.toMatchObject({ status: 404 });
    await revokeDeployHook(userId, project.id);
    await expect(triggerDeployHook(second.token, {})).rejects.toMatchObject({ status: 404 });
  });

  it("only the owner can create one", async () => {
    await expect(createDeployHook(otherUserId, project.id)).rejects.toMatchObject({ status: 404 });
  });

  it("is reported in the project view without the token", async () => {
    const { token } = await createDeployHook(userId, project.id);
    const view = (await projectViews(userId)).find((p) => p.id === project.id)!;
    expect(view.hookActive).toBe(true);
    expect(JSON.stringify(view)).not.toContain(token);
  });
});

describe("notification URLs", () => {
  it("accepts Discord and Slack webhooks only", () => {
    expect(parseNotifyUrl(DISCORD).kind).toBe("discord");
    expect(parseNotifyUrl("https://canary.discord.com/api/webhooks/1/abc").kind).toBe("discord");
    expect(parseNotifyUrl(SLACK).kind).toBe("slack");
  });
  it("refuses everything that could reach somewhere else", () => {
    for (const bad of [
      "http://discord.com/api/webhooks/1/abc",
      "https://discord.com.evil.test/api/webhooks/1/abc",
      "https://evil.test/api/webhooks/1/abc",
      "https://user:pw@discord.com/api/webhooks/1/abc",
      "https://discord.com:8443/api/webhooks/1/abc",
      "https://discord.com/api/webhooks/1/abc?x=1",
      "https://discord.com/other",
      "https://hooks.slack.com/other/T/B/x",
      "https://127.0.0.1/api/webhooks/1/abc",
      "https://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(() => parseNotifyUrl(bad), bad).toThrow();
    }
  });
});

describe("notifications", () => {
  const ok: Fetcher = () => Promise.resolve(new Response(null, { status: 204 }));

  it("seals the URL and never returns it", async () => {
    const summary = await setNotifications(userId, project.id, { url: DISCORD, on: "all" });
    expect(summary).toEqual({ kind: "discord", on: "all" });
    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get();
    expect(row?.notifyUrlEnc).toBeTruthy();
    expect(row?.notifyUrlEnc).not.toContain("discord");
    const view = (await projectViews(userId)).find((p) => p.id === project.id)!;
    expect(view.notify).toEqual({ kind: "discord", on: "all" });
    expect(JSON.stringify(view)).not.toContain("123456789012345678");
  });

  it("rejects a bad URL when saving", async () => {
    await expect(setNotifications(userId, project.id, { url: "https://evil.test/x", on: "all" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("posts a Discord message when a deployment is ready", async () => {
    const dep = await deployBranch(userId, project.id);
    await finish(dep.id, "ready", { commitSha: "a08c6f1b77", commitMessage: "Fix timezone offset" });
    const fetcher = vi.fn(ok);
    await notifyDeploymentFinished(dep.id, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(DISCORD);
    expect(init.redirect).toBe("error");
    const body = JSON.parse(String(init.body));
    expect(body.content).toContain("Hooked is live in production");
    expect(body.content).toContain("a08c6f1");
    expect(body.content).toContain(`/projects/${project.slug}/deployments/${dep.id}`);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it("uses the Slack shape for Slack", async () => {
    await setNotifications(userId, project.id, { url: SLACK, on: "all" });
    const dep = await deployBranch(userId, project.id);
    await finish(dep.id, "error", { error: "No healthy response on port 3010 after 45s" });
    const fetcher = vi.fn(ok);
    await notifyDeploymentFinished(dep.id, fetcher);
    const body = JSON.parse(String((fetcher.mock.calls[0] as [string, RequestInit])[1].body));
    expect(Object.keys(body)).toEqual(["text"]);
    expect(body.text).toContain("Hooked failed to deploy to production");
    expect(body.text).toContain("No healthy response");
  });

  it("can be limited to failures", async () => {
    await setNotifications(userId, project.id, { url: DISCORD, on: "failures" });
    const good = await deployBranch(userId, project.id);
    await finish(good.id, "ready");
    const bad = await deployBranch(userId, project.id);
    await finish(bad.id, "error", { error: "boom" });
    const fetcher = vi.fn(ok);
    await notifyDeploymentFinished(good.id, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await notifyDeploymentFinished(bad.id, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores deployments that are not finished and never throws", async () => {
    const dep = await deployBranch(userId, project.id);
    const fetcher = vi.fn(ok);
    await notifyDeploymentFinished(dep.id, fetcher);
    expect(fetcher).not.toHaveBeenCalled();

    await finish(dep.id, "ready");
    const failing = vi.fn(() => Promise.reject(new Error("network down")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(notifyDeploymentFinished(dep.id, failing)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("test message reports a service error", async () => {
    await expect(
      sendTestNotification(userId, project.id, () => Promise.resolve(new Response(null, { status: 404 })))
    ).rejects.toMatchObject({ status: 502 });
    const fetcher = vi.fn(ok);
    await sendTestNotification(userId, project.id, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("clears, and belongs to the owner", async () => {
    await expect(setNotifications(otherUserId, project.id, { url: DISCORD, on: "all" })).rejects.toMatchObject({
      status: 404,
    });
    await clearNotifications(userId, project.id);
    await expect(sendTestNotification(userId, project.id, ok)).rejects.toMatchObject({ status: 400 });
    const dep = await deployBranch(userId, project.id);
    await finish(dep.id, "ready");
    const fetcher = vi.fn(ok);
    await notifyDeploymentFinished(dep.id, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
