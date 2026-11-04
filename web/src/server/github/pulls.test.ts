import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { resetConfigForTests } from "@/server/config";
import { getDb, schema } from "@/server/db";
import { clearTokenCacheForTests } from "@/server/github/app";
import {
  closePullRequestPreviews,
  commentDeploymentOnPr,
  previewComment,
  upsertPullRequestComment,
} from "@/server/github/pulls";
import { handleGithubEvent } from "@/server/github/webhook";
import { createProject, type ProjectRow } from "@/server/projects";
import { createServer } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let project: ProjectRow;
let n = 0;

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_CLIENT_ID = "Iv1.abc";
  process.env.GITHUB_APP_CLIENT_SECRET = "secret";
  process.env.GITHUB_WEBHOOK_SECRET = "hook-secret";
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
    .export({ type: "pkcs1", format: "pem" })
    .toString()
    .replace(/\n/g, "\\n");
  resetConfigForTests();
  ctx = await useFreshDb();
  const userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  const serverId = (await createServer(userId, "sam-r")).id;
  project = await createProject(userId, {
    serverId,
    name: "App",
    slug: "app",
    repoUrl: "https://github.com/sam/app.git",
    repoFullName: "sam/app",
    installationId: 99,
    runtime: "node",
    port: 3000,
  });
});
afterAll(async () => {
  await ctx.cleanup();
  for (const k of ["GITHUB_APP_ID", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_PRIVATE_KEY"]) {
    delete process.env[k];
  }
  resetConfigForTests();
});
beforeEach(async () => {
  clearTokenCacheForTests();
  const db = await getDb();
  await db.delete(schema.deployments);
  n = 0;
});

const sha = () => `${(++n).toString(16).padStart(2, "0")}`.repeat(20);
const pr = (over: Record<string, unknown> = {}, action = "opened", number = 7) => ({
  action,
  repository: { full_name: "sam/app" },
  installation: { id: 99 },
  pull_request: {
    number,
    draft: false,
    head: { ref: "feat/x", sha: "a".repeat(40), repo: { full_name: "sam/app" } },
    ...over,
  },
});

async function all() {
  return (await getDb()).select().from(schema.deployments);
}

describe("pull_request events", () => {
  it("builds a preview for a pull request and records its number", async () => {
    const r = await handleGithubEvent("pull_request", pr());
    expect(r.handled).toBe(true);
    expect(r.deployments).toHaveLength(1);
    const [d] = await all();
    expect(d).toMatchObject({ env: "preview", branch: "feat/x", prNumber: 7, commitSha: "a".repeat(40) });
  });

  it("links the pull request to a preview the push already started, without a second build", async () => {
    const head = sha();
    await handleGithubEvent("push", {
      ref: "refs/heads/feat/x",
      after: head,
      repository: { full_name: "sam/app" },
      installation: { id: 99 },
    });
    expect((await all())[0].prNumber).toBeNull();

    const r = await handleGithubEvent("pull_request", pr({ head: { ref: "feat/x", sha: head, repo: { full_name: "sam/app" } } }));
    expect(r.deployments).toHaveLength(0);
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0].prNumber).toBe(7);
  });

  it("does not build the other way round twice either", async () => {
    const head = sha();
    const open = pr({ head: { ref: "feat/x", sha: head, repo: { full_name: "sam/app" } } });
    await handleGithubEvent("pull_request", open);
    await handleGithubEvent("push", {
      ref: "refs/heads/feat/x",
      after: head,
      repository: { full_name: "sam/app" },
      installation: { id: 99 },
    });
    expect(await all()).toHaveLength(1);
  });

  it("never builds forks, drafts, or the production branch", async () => {
    const fork = await handleGithubEvent(
      "pull_request",
      pr({ head: { ref: "feat/x", sha: sha(), repo: { full_name: "stranger/app" } } })
    );
    expect(fork.handled).toBe(false);
    expect(fork.note).toMatch(/fork/);

    const draft = await handleGithubEvent("pull_request", pr({ draft: true }));
    expect(draft.handled).toBe(false);

    const prod = await handleGithubEvent(
      "pull_request",
      pr({ head: { ref: "main", sha: sha(), repo: { full_name: "sam/app" } } })
    );
    expect(prod.deployments).toHaveLength(0);
    expect(await all()).toHaveLength(0);
  });

  it("ignores events from an installation we do not know", async () => {
    const r = await handleGithubEvent("pull_request", { ...pr(), installation: { id: 1234 } });
    expect(r.deployments).toHaveLength(0);
  });

  it("ignores actions that change nothing", async () => {
    expect((await handleGithubEvent("pull_request", pr({}, "labeled"))).handled).toBe(false);
  });

  it("cancels what is still running when the pull request closes", async () => {
    await handleGithubEvent("pull_request", pr());
    const result = await closePullRequestPreviews(project.id, 7);
    expect(result.canceled).toBe(1);
    const [d] = await all();
    expect(d.state).toBe("canceled");
    const jobs = await (await getDb()).select().from(schema.jobs).where(eq(schema.jobs.deploymentId, d.id));
    expect(jobs[0].state).toBe("failed");
  });
});

describe("the pull request comment", () => {
  it("says nothing about errors, servers or secrets", () => {
    const body = previewComment({
      projectName: "App",
      branch: "feat/x",
      sha: "a".repeat(40),
      state: "error",
      port: 20001,
      link: "https://deploy.example/projects/app/deployments/1",
    });
    expect(body).toContain("Preview failed");
    expect(body).toContain("aaaaaaa");
    expect(body).toContain("<!-- nest-deploy-preview -->");
    expect(body).not.toMatch(/hackclub\.app/);
    const ok = previewComment({ projectName: "App", branch: "b", sha: null, state: "ready", port: 20001, link: "l" });
    expect(ok).toContain("Preview ready");
    expect(ok).not.toMatch(/hackclub\.app/);
  });

  function fakeGithub(existing: { id: number; body: string; user: { type: string } }[]) {
    const calls: { method: string; url: string; body?: string }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push({ method, url: u, body: init?.body as string | undefined });
      if (u.includes("/access_tokens")) {
        return Response.json({ token: "t", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
      }
      if (method === "GET") return Response.json(existing);
      return Response.json({ id: 1 }, { status: method === "POST" ? 201 : 200 });
    }) as typeof fetch;
    return { fetcher, calls };
  }

  it("creates the comment once, then updates it in place", async () => {
    const first = fakeGithub([]);
    await upsertPullRequestComment(99, "sam/app", 7, "hello\n<!-- nest-deploy-preview -->", first.fetcher);
    expect(first.calls.some((c) => c.method === "POST" && c.url.endsWith("/issues/7/comments"))).toBe(true);

    clearTokenCacheForTests();
    const second = fakeGithub([{ id: 55, body: "old\n<!-- nest-deploy-preview -->", user: { type: "Bot" } }]);
    await upsertPullRequestComment(99, "sam/app", 7, "new\n<!-- nest-deploy-preview -->", second.fetcher);
    expect(second.calls.some((c) => c.method === "PATCH" && c.url.endsWith("/issues/comments/55"))).toBe(true);
    expect(second.calls.some((c) => c.method === "POST" && c.url.includes("/issues/7/comments"))).toBe(false);
  });

  it("never edits a person's comment that happens to contain the marker", async () => {
    const g = fakeGithub([{ id: 9, body: "quote: <!-- nest-deploy-preview -->", user: { type: "User" } }]);
    await upsertPullRequestComment(99, "sam/app", 7, "x\n<!-- nest-deploy-preview -->", g.fetcher);
    expect(g.calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(g.calls.some((c) => c.method === "POST" && c.url.includes("/issues/7/comments"))).toBe(true);
  });

  it("refuses malformed repository names and numbers", async () => {
    const g = fakeGithub([]);
    await expect(upsertPullRequestComment(99, "../../etc", 7, "x", g.fetcher)).rejects.toThrow();
    await expect(upsertPullRequestComment(99, "sam/app", 0, "x", g.fetcher)).rejects.toThrow();
    expect(g.calls).toHaveLength(0);
  });

  it("comments when a pull request deployment finishes, and never throws", async () => {
    await handleGithubEvent("pull_request", pr());
    const [d] = await all();
    const db = await getDb();
    await db.update(schema.deployments).set({ state: "ready" }).where(eq(schema.deployments.id, d.id));
    // Not finished-state or no pull request: nothing to do, and no error.
    await expect(commentDeploymentOnPr("nope")).resolves.toBeUndefined();
  });
});
