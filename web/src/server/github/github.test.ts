import { createHmac, generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { resetConfigForTests } from "@/server/config";
import { schema } from "@/server/db";
import {
  appJwt,
  assertInstallationOwned,
  clearTokenCacheForTests,
  installationToken,
  installationsForCode,
  listInstallationRepos,
  saveInstallations,
  verifyWebhookSignature,
} from "@/server/github/app";
import { handleGithubEvent } from "@/server/github/webhook";
import { createProject } from "@/server/projects";
import { createServer } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let serverId: string;

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_CLIENT_ID = "Iv1.abc";
  process.env.GITHUB_APP_CLIENT_SECRET = "secret";
  process.env.GITHUB_WEBHOOK_SECRET = "hook-secret";
  // PKCS#1 with escaped newlines, the way a .env file usually carries it.
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
    .export({ type: "pkcs1", format: "pem" })
    .toString()
    .replace(/\n/g, "\\n");
  resetConfigForTests();
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  serverId = (await createServer(userId, "sam-r")).id;
});
afterAll(async () => {
  await ctx.cleanup();
  for (const k of ["GITHUB_APP_ID", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_PRIVATE_KEY"]) {
    delete process.env[k];
  }
  resetConfigForTests();
});

describe("app authentication", () => {
  it("signs a short-lived RS256 JWT for the app", async () => {
    const jwt = await appJwt(1_700_000_000);
    const claims = decodeJwt(jwt);
    expect(claims.iss).toBe("12345");
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(10 * 60);
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("fetches an installation token once and caches it", async () => {
    clearTokenCacheForTests();
    let calls = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      calls++;
      expect(url).toBe("https://api.github.com/app/installations/42/access_tokens");
      expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer ey/);
      return Response.json({ token: "ghs_abc", expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }) as unknown as typeof fetch;
    expect(await installationToken(42, fake)).toBe("ghs_abc");
    expect(await installationToken(42, fake)).toBe("ghs_abc");
    expect(calls).toBe(1);
  });

  it("explains a removed installation", async () => {
    clearTokenCacheForTests();
    const fake = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    await expect(installationToken(99, fake)).rejects.toThrow(/no longer installed/);
  });

  it("lists repositories newest first", async () => {
    clearTokenCacheForTests();
    const fake = (async (url: string) => {
      if (url.includes("access_tokens")) {
        return Response.json({ token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() });
      }
      return Response.json({
        repositories: [
          { id: 1, full_name: "sam/old", private: false, default_branch: "main", pushed_at: "2025-01-01T00:00:00Z", clone_url: "https://github.com/sam/old.git" },
          { id: 2, full_name: "sam/new", private: true, default_branch: "dev", pushed_at: "2026-01-01T00:00:00Z", clone_url: "https://github.com/sam/new.git" },
        ],
      });
    }) as unknown as typeof fetch;
    const repos = await listInstallationRepos(7, fake);
    expect(repos.map((r) => r.fullName)).toEqual(["sam/new", "sam/old"]);
    expect(repos[0]).toMatchObject({ private: true, defaultBranch: "dev" });
  });
});

describe("linking installations", () => {
  it("keeps only this app's installations and links them to the user", async () => {
    const fake = (async (url: string) => {
      if (url.includes("login/oauth/access_token")) return Response.json({ access_token: "user-token" });
      return Response.json({
        installations: [
          { id: 1, app_id: 12345, account: { login: "sam-r", type: "User" } },
          { id: 2, app_id: 99999, account: { login: "other-app", type: "User" } },
        ],
      });
    }) as unknown as typeof fetch;
    const installs = await installationsForCode("code", fake);
    expect(installs).toEqual([{ id: 1, login: "sam-r", type: "User" }]);
    await saveInstallations(userId, installs);
    expect((await assertInstallationOwned(userId, 1)).accountLogin).toBe("sam-r");
  });

  it("does not let another user claim an installation", async () => {
    const other = (await upsertUser({ id: "u2", name: "Kim", email: null, slackId: null })).id;
    await saveInstallations(other, [{ id: 1, login: "sam-r", type: "User" }]);
    await expect(assertInstallationOwned(other, 1)).rejects.toThrow(/not linked/);
    expect((await assertInstallationOwned(userId, 1)).userId).toBe(userId);
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ hello: "world" });
  const sig = "sha256=" + createHmac("sha256", "hook-secret").update(body).digest("hex");

  it("accepts a correct signature", () => {
    expect(verifyWebhookSignature(body, sig, "hook-secret")).toBe(true);
  });
  it("rejects wrong, missing and tampered signatures", () => {
    expect(verifyWebhookSignature(body, null, "hook-secret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=deadbeef", "hook-secret")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sig, "hook-secret")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(body, sig.replace("sha256=", "sha1="), "hook-secret")).toBe(false);
  });
});

describe("push events", () => {
  const push = (ref: string, after = "b".repeat(40), extra: object = {}) => ({
    ref,
    after,
    repository: { full_name: "sam/demo" },
    head_commit: { message: "Fix the thing\n\nlong body", author: { username: "sam" } },
    ...extra,
  });

  it("deploys the production branch to production", async () => {
    await createProject(userId, {
      serverId,
      name: "Demo",
      repoUrl: "https://github.com/sam/demo",
      repoFullName: "sam/demo",
      runtime: "node",
      port: 3010,
    });
    const r = await handleGithubEvent("push", push("refs/heads/main"));
    expect(r.deployments).toHaveLength(1);
    const dep = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, r.deployments[0])).get();
    expect(dep).toMatchObject({ env: "production", source: "webhook", branch: "main", state: "queued", commitMessage: "Fix the thing", author: "sam" });
    expect(dep?.port).toBe(3010);
  });

  it("builds a preview on its own port for other branches", async () => {
    const r = await handleGithubEvent("push", push("refs/heads/feature/login", "c".repeat(40)));
    const dep = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, r.deployments[0])).get();
    expect(dep?.env).toBe("preview");
    expect(dep?.port).toBeGreaterThanOrEqual(20000);
  });

  it("ignores a repeated delivery of the same commit", async () => {
    const again = await handleGithubEvent("push", push("refs/heads/main"));
    expect(again.deployments).toHaveLength(0);
  });

  it("ignores deleted branches, tags, other repos and unknown events", async () => {
    expect((await handleGithubEvent("push", push("refs/heads/x", "0".repeat(40), { deleted: true }))).deployments).toHaveLength(0);
    expect((await handleGithubEvent("push", push("refs/tags/v1"))).handled).toBe(false);
    expect((await handleGithubEvent("push", { ...push("refs/heads/main", "d".repeat(40)), repository: { full_name: "nobody/else" } })).deployments).toHaveLength(0);
    expect((await handleGithubEvent("issues", {})).handled).toBe(false);
    expect((await handleGithubEvent("ping", {})).handled).toBe(true);
  });

  it("respects the auto-deploy switch", async () => {
    await ctx.db.update(schema.projects).set({ autoDeploy: false }).where(eq(schema.projects.repoFullName, "sam/demo"));
    expect((await handleGithubEvent("push", push("refs/heads/main", "e".repeat(40)))).deployments).toHaveLength(0);
  });

  it("forgets an uninstalled app", async () => {
    await ctx.db.update(schema.projects).set({ installationId: 1 }).where(eq(schema.projects.repoFullName, "sam/demo"));
    await handleGithubEvent("installation", { action: "deleted", installation: { id: 1 } });
    const p = await ctx.db.select().from(schema.projects).where(eq(schema.projects.repoFullName, "sam/demo")).get();
    expect(p?.installationId).toBeNull();
    expect(await ctx.db.select().from(schema.githubInstallations).where(eq(schema.githubInstallations.id, 1))).toHaveLength(0);
  });
});
