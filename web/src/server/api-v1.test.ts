import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createApiToken, revokeApiToken, SCOPES, type Scope } from "@/server/api-tokens";
import { ENDPOINTS } from "@/server/api-v1";
import { upsertUser } from "@/server/auth/session";
import { newId } from "@/server/crypto";
import { schema } from "@/server/db";
import { createProject, deployBranch } from "@/server/projects";
import { rateLimiter } from "@/server/rate-limit";
import { useFreshDb } from "@/server/test/db";

// The route layer is real. Sign-in is replaced only so we can prove it is never consulted,
// and the SSH session is replaced by a scripted one.
vi.mock("@/server/auth/current", () => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/server/servers", async (original) => {
  const real = await original<typeof import("@/server/servers")>();
  return { ...real, withServerSession: vi.fn() };
});

import { getCurrentUser } from "@/server/auth/current";
import { createServer, withServerSession } from "@/server/servers";
import { GET as listProjects } from "@/app/api/v1/projects/route";
import { GET as getProject } from "@/app/api/v1/projects/[projectId]/route";
import { GET as listDeps, POST as deploy } from "@/app/api/v1/projects/[projectId]/deployments/route";
import { GET as logs } from "@/app/api/v1/projects/[projectId]/logs/route";
import { POST as redeploy } from "@/app/api/v1/deployments/[deploymentId]/redeploy/route";
import { POST as cancel } from "@/app/api/v1/deployments/[deploymentId]/cancel/route";
import { POST as rollback } from "@/app/api/v1/deployments/[deploymentId]/rollback/route";
import { GET as domains } from "@/app/api/v1/domains/route";
import { GET as usage } from "@/app/api/v1/servers/[serverId]/usage/route";
import { GET as openapi } from "@/app/api/v1/openapi.json/route";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string };
let other: { id: string };
let myServerId: string;
let theirServerId: string;
let projectId: string;
let theirProjectId: string;
let theirDeploymentId: string;
let myDeploymentId: string;

const session = { script: vi.fn() };
let scriptReply: (command: string) => { code: number; stdout?: string; stderr?: string } = () => ({ code: 0, stdout: "" });

const ALL: Scope[] = [...SCOPES];
const token = async (scopes: Scope[] = ALL, userId = me.id) => (await createApiToken(userId, { name: "t", scopes })).secret;

type Handler = (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
const req = (path: string, init: { method?: string; secret?: string | null; auth?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { ...init.headers };
  if (init.auth !== undefined) headers.authorization = init.auth;
  else if (init.secret) headers.authorization = `Bearer ${init.secret}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000/api/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
};
const run = (h: Handler, request: NextRequest, params: Record<string, string> = {}) => h(request, { params: Promise.resolve(params) });
const errorOf = async (res: Response) => {
  const body = await res.json();
  return { status: res.status, code: body.error?.code as string, message: body.error?.message as string };
};

const sshWasUsed = () => vi.mocked(withServerSession).mock.calls.length > 0;

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "a1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "a2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  myServerId = (await createServer(me.id, "sam-api")).id;
  theirServerId = (await createServer(other.id, "kim-api")).id;
  projectId = (await createProject(me.id, { ...base, serverId: myServerId, name: "App", slug: "app", port: 3000 })).id;
  theirProjectId = (await createProject(other.id, { ...base, serverId: theirServerId, name: "Theirs", slug: "theirs", port: 3001 })).id;
  myDeploymentId = (await deployBranch(me.id, projectId)).id;
  theirDeploymentId = (await deployBranch(other.id, theirProjectId)).id;
  await ctx.db.insert(schema.domains).values([
    { id: newId(), userId: me.id, serverId: myServerId, projectId, domain: "app.example.com", port: 3000, status: "valid", createdAt: new Date() },
    { id: newId(), userId: other.id, serverId: theirServerId, projectId: theirProjectId, domain: "theirs.example.com", port: 3001, status: "pending", createdAt: new Date() },
  ]);
});
afterAll(async () => {
  await ctx.cleanup();
});

beforeEach(async () => {
  // Each test mints its own tokens; start from none so the per-user cap is never hit.
  await ctx.db.delete(schema.apiTokens);
  rateLimiter().clear();
  scriptReply = () => ({ code: 0, stdout: "" });
  session.script.mockReset();
  session.script.mockImplementation(async (command: string) => {
    const r = scriptReply(command);
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  });
  vi.mocked(withServerSession).mockReset();
  vi.mocked(withServerSession).mockImplementation(async (_s, fn) => fn(session as never));
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: me.id, name: "Sam" } as never);
});

/** Every endpoint, called with a valid-looking request and the given Authorization header. */
const everyEndpoint = (secret: string | null, auth?: string): [string, () => Promise<Response>][] => {
  const o = { secret, auth };
  return [
    ["list_projects", () => run(listProjects, req("/projects", o))],
    ["get_project", () => run(getProject, req(`/projects/${projectId}`, o), { projectId })],
    ["list_deployments", () => run(listDeps, req(`/projects/${projectId}/deployments`, o), { projectId })],
    ["deploy_branch", () => run(deploy, req(`/projects/${projectId}/deployments`, { ...o, method: "POST", body: {} }), { projectId })],
    ["redeploy", () => run(redeploy, req(`/deployments/${myDeploymentId}/redeploy`, { ...o, method: "POST" }), { deploymentId: myDeploymentId })],
    ["cancel_deployment", () => run(cancel, req(`/deployments/${myDeploymentId}/cancel`, { ...o, method: "POST" }), { deploymentId: myDeploymentId })],
    ["rollback_deployment", () => run(rollback, req(`/deployments/${myDeploymentId}/rollback`, { ...o, method: "POST" }), { deploymentId: myDeploymentId })],
    ["get_logs", () => run(logs, req(`/projects/${projectId}/logs`, o), { projectId })],
    ["list_domains", () => run(domains, req("/domains", o))],
    ["get_server_usage", () => run(usage, req(`/servers/${myServerId}/usage`, o), { serverId: myServerId })],
  ];
};

// The first ten endpoints are exercised here. Every later one has its own tests in
// api-v1-expansion.test.ts and api-v1-shell.test.ts, which check that they cover the rest.
const FIRST_ENDPOINTS = [
  "list_projects",
  "get_project",
  "list_deployments",
  "deploy_branch",
  "redeploy",
  "cancel_deployment",
  "rollback_deployment",
  "get_logs",
  "list_domains",
  "get_server_usage",
];

describe("the endpoint list", () => {
  it("is covered by these tests", () => {
    expect(everyEndpoint(null).map(([id]) => id).sort()).toEqual([...FIRST_ENDPOINTS].sort());
    expect(ENDPOINTS.map((e) => e.id)).toEqual(expect.arrayContaining(FIRST_ENDPOINTS));
  });
});

describe("authentication", () => {
  it("answers 401 with WWW-Authenticate: Bearer when there is no token", async () => {
    for (const [id, call] of everyEndpoint(null)) {
      const res = await call();
      expect(res.status, id).toBe(401);
      expect(res.headers.get("www-authenticate"), id).toBe("Bearer");
      expect((await errorOf(res)).code).toBe("unauthorized");
    }
    expect(sshWasUsed()).toBe(false);
  });

  it("answers 401 for malformed and wrong-prefix tokens", async () => {
    const real = await token();
    const bad = ["Basic abc", "Bearer", "Bearer ", `Bearer ${real} extra`, "Bearer sk_live_123", `Bearer ${real.replace("ndp_", "xyz_")}`, real, "Bearer ndp_"];
    for (const auth of bad) {
      const res = await run(listProjects, req("/projects", { auth }));
      expect(res.status, auth.slice(0, 20)).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
    }
  });

  it("makes unknown, revoked and expired tokens look identical", async () => {
    const revoked = await createApiToken(me.id, { name: "r", scopes: ALL });
    await revokeApiToken(me.id, revoked.token.id);
    const expired = await createApiToken(me.id, { name: "e", scopes: ALL, expiresInDays: 7 }, new Date(Date.now() - 30 * 86_400_000));

    const results = [];
    for (const secret of ["ndp_" + "x".repeat(43), revoked.secret, expired.secret]) {
      const res = await run(listProjects, req("/projects", { secret }));
      results.push({ status: res.status, www: res.headers.get("www-authenticate"), body: await res.json() });
    }
    expect(results[0].status).toBe(401);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("never accepts a cookie session, with or without a bad token", async () => {
    const cookie = { cookie: "nd_session=whatever" };
    const res = await run(listProjects, new NextRequest("http://localhost:3000/api/v1/projects", { headers: cookie }));
    expect(res.status).toBe(401);
    const res2 = await run(
      deploy,
      new NextRequest(`http://localhost:3000/api/v1/projects/${projectId}/deployments`, { method: "POST", headers: cookie, body: "{}" }),
      { projectId }
    );
    expect(res2.status).toBe(401);
    const res3 = await run(listProjects, new NextRequest("http://localhost:3000/api/v1/projects", { headers: { ...cookie, authorization: "Bearer ndp_nope" } }));
    expect(res3.status).toBe(401);
    // The signed-in user lookup is never even consulted.
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(sshWasUsed()).toBe(false);
  });

  it("does not need the bearer scheme to be capitalised", async () => {
    const secret = await token();
    const res = await run(listProjects, req("/projects", { auth: `bearer ${secret}` }));
    expect(res.status).toBe(200);
  });
});

describe("scope gates", () => {
  it("answers 403 naming the scope when a token lacks it, before doing anything", async () => {
    const needs = new Map(ENDPOINTS.map((e) => [e.id, e.scope]));
    for (const scope of SCOPES) {
      const without = await token(ALL.filter((s) => s !== scope));
      for (const [id, call] of everyEndpoint(without)) {
        if (needs.get(id) !== scope) continue;
        const res = await call();
        const e = await errorOf(res);
        expect(res.status, id).toBe(403);
        expect(e.code).toBe("forbidden");
        expect(e.message).toContain(scope);
      }
    }
    expect(sshWasUsed()).toBe(false);
  });

  it("lets a token with exactly the right scope through", async () => {
    for (const ep of ENDPOINTS.filter((e) => e.method === "GET" && FIRST_ENDPOINTS.includes(e.id))) {
      const secret = await token([ep.scope]);
      const calls = Object.fromEntries(everyEndpoint(secret));
      scriptReply = () => ({ code: 0, stdout: "load1=0.5\ncpus=2\n" });
      expect((await calls[ep.id]()).status, ep.id).toBe(200);
    }
  });

  it("does not let one write scope act as a read scope", async () => {
    const secret = await token(["deployments:write"]);
    const res = await run(listDeps, req(`/projects/${projectId}/deployments`, { secret }), { projectId });
    expect(res.status).toBe(403);
  });
});

describe("ownership", () => {
  it("answers 404 for another user's project, deployment and server, and for ids that do not exist", async () => {
    const secret = await token();
    const cases: [string, () => Promise<Response>][] = [];
    for (const id of [theirProjectId, "no-such-id"]) {
      cases.push(
        [`get_project ${id}`, () => run(getProject, req(`/projects/${id}`, { secret }), { projectId: id })],
        [`list_deployments ${id}`, () => run(listDeps, req(`/projects/${id}/deployments`, { secret }), { projectId: id })],
        [`deploy ${id}`, () => run(deploy, req(`/projects/${id}/deployments`, { secret, method: "POST", body: {} }), { projectId: id })],
        [`logs ${id}`, () => run(logs, req(`/projects/${id}/logs`, { secret }), { projectId: id })],
      );
    }
    for (const id of [theirDeploymentId, "no-such-id"]) {
      for (const [name, h] of [["redeploy", redeploy], ["cancel", cancel], ["rollback", rollback]] as const) {
        cases.push([`${name} ${id}`, () => run(h, req(`/deployments/${id}/${name}`, { secret, method: "POST" }), { deploymentId: id })]);
      }
    }
    for (const id of [theirServerId, "no-such-id"]) {
      cases.push([`usage ${id}`, () => run(usage, req(`/servers/${id}/usage`, { secret }), { serverId: id })]);
    }

    const depsBefore = (await ctx.db.select().from(schema.deployments)).length;
    for (const [name, call] of cases) {
      const e = await errorOf(await call());
      expect(e, name).toMatchObject({ status: 404, code: "not_found" });
    }
    expect((await ctx.db.select().from(schema.deployments)).length).toBe(depsBefore);
    expect(sshWasUsed()).toBe(false);
  });

  it("lists only the caller's projects and domains", async () => {
    const secret = await token();
    const { projects } = await (await run(listProjects, req("/projects", { secret }))).json();
    expect(projects.map((p: { id: string }) => p.id)).toEqual([projectId]);
    const body = await (await run(domains, req("/domains", { secret }))).json();
    expect(body.domains.map((d: { domain: string }) => d.domain)).toEqual(["app.example.com"]);
  });
});

describe("projects and deployments", () => {
  it("returns the project shape with the latest deployment and no secrets", async () => {
    const secret = await token();
    const res = await run(getProject, req(`/projects/${projectId}`, { secret }), { projectId });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { project } = await res.json();
    expect(project).toMatchObject({
      id: projectId,
      slug: "app",
      name: "App",
      branch: "main",
      runtime: "node",
      port: 3000,
      state: "queued",
      latestDeployment: { id: expect.any(String), env: "production", state: "queued", branch: "main" },
    });
    for (const hidden of ["hookActive", "analyticsKey", "nestUsername", "domains", "statusUrl", "notify", "repoUrl"]) {
      expect(project).not.toHaveProperty(hidden);
    }
  });

  it("lists deployments with a default of 20 and a limit of 1 to 100", async () => {
    const secret = await token();
    for (let i = 0; i < 24; i++) await deployBranch(me.id, projectId);
    const list = async (q: string) => run(listDeps, req(`/projects/${projectId}/deployments${q}`, { secret }), { projectId });
    expect((await (await list("")).json()).deployments).toHaveLength(20);
    expect((await (await list("?limit=3")).json()).deployments).toHaveLength(3);
    expect((await (await list("?limit=100")).json()).deployments.length).toBeGreaterThan(20);
    for (const bad of ["0", "101", "abc", "1.5", "-1", ""]) {
      expect((await list(`?limit=${bad}`)).status, bad).toBe(400);
    }
  });

  it("deploys the production branch by default and answers 202", async () => {
    const secret = await token();
    const res = await run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST" }), { projectId });
    expect(res.status).toBe(202);
    const { deployment } = await res.json();
    expect(deployment).toMatchObject({ projectId, env: "production", state: "queued", branch: "main", source: "manual" });
    const jobs = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.deploymentId, deployment.id));
    expect(jobs).toHaveLength(1);
  });

  it("deploys another branch as a preview, and audits it without the token secret", async () => {
    const secret = await token();
    const res = await run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST", body: { branch: "feature/login" } }), { projectId });
    expect(res.status).toBe(202);
    expect((await res.json()).deployment).toMatchObject({ env: "preview", branch: "feature/login" });

    const rows = (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, me.id))).filter((r) => r.action === "deploy.trigger");
    const row = rows.find((r) => JSON.parse(r.meta!).branch === "feature/login")!;
    expect(row.target).toBe(projectId);
    expect(JSON.parse(row.meta!)).toMatchObject({ via: "api", env: "preview" });
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it("refuses bad bodies and branches, and never lets the body retarget the project", async () => {
    const secret = await token();
    const before = (await ctx.db.select().from(schema.deployments)).length;
    const post = (body: unknown) => run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST", body }), { projectId });
    for (const body of ["not json", "[]", "null", { brach: "main" }, { branch: 5 }, { branch: "--upload-pack=x" }, { branch: "a..b" }, { branch: "x y" }, { branch: "" }, { branch: "a".repeat(201) }]) {
      expect((await post(body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    const retarget = await post({ projectId: theirProjectId });
    expect(retarget.status).toBe(400);
    expect((await ctx.db.select().from(schema.deployments)).length).toBe(before);
  });

  it("redeploys, cancels and rolls back with the existing audit actions", async () => {
    const secret = await token();
    const dep = (await (await run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST" }), { projectId })).json()).deployment;

    const re = await run(redeploy, req(`/deployments/${dep.id}/redeploy`, { secret, method: "POST" }), { deploymentId: dep.id });
    expect(re.status).toBe(202);
    const redone = (await re.json()).deployment;
    expect(redone).toMatchObject({ source: "redeploy", state: "queued" });
    expect(redone.id).not.toBe(dep.id);

    const cn = await run(cancel, req(`/deployments/${dep.id}/cancel`, { secret, method: "POST" }), { deploymentId: dep.id });
    expect(cn.status).toBe(200);
    expect((await cn.json()).deployment).toMatchObject({ id: dep.id, state: "canceled" });
    const again = await run(cancel, req(`/deployments/${dep.id}/cancel`, { secret, method: "POST" }), { deploymentId: dep.id });
    expect(await errorOf(again)).toMatchObject({ status: 409, code: "conflict" });

    const notReady = await run(rollback, req(`/deployments/${dep.id}/rollback`, { secret, method: "POST" }), { deploymentId: dep.id });
    expect(notReady.status).toBe(400);

    await ctx.db.update(schema.deployments).set({ state: "ready", isCurrent: false, cleanedUp: false }).where(eq(schema.deployments.id, dep.id));
    const rb = await run(rollback, req(`/deployments/${dep.id}/rollback`, { secret, method: "POST" }), { deploymentId: dep.id });
    expect(rb.status).toBe(202);
    expect((await rb.json()).deployment).toMatchObject({ source: "rollback" });

    const actions = (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, me.id))).map((r) => r.action);
    for (const a of ["deploy.redeploy", "deploy.cancel", "deploy.rollback"]) expect(actions).toContain(a);
  });
});

describe("logs, domains and usage", () => {
  it("returns runtime log lines for the owner's project and checks `lines`", async () => {
    const secret = await token();
    scriptReply = () => ({ code: 0, stdout: "line one\nline two\nline three\n" });
    const res = await run(logs, req(`/projects/${projectId}/logs?lines=2`, { secret }), { projectId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId, lines: ["line two", "line three"] });
    for (const bad of ["0", "1001", "x"]) {
      expect((await run(logs, req(`/projects/${projectId}/logs?lines=${bad}`, { secret }), { projectId })).status, bad).toBe(400);
    }
  });

  it("does not leak container errors from the log read", async () => {
    const secret = await token();
    scriptReply = () => ({ code: 3, stderr: "/home/sam/secret: boom" });
    const e = await errorOf(await run(logs, req(`/projects/${projectId}/logs`, { secret }), { projectId }));
    expect(e).toMatchObject({ status: 502, code: "upstream" });
    expect(e.message).not.toContain("boom");
  });

  it("returns current CPU, memory and disk for the owner's server", async () => {
    const secret = await token();
    scriptReply = () => ({
      code: 0,
      stdout: "cpus=4\nload1=1.5\nmem_total_mb=2048\nmem_used_mb=512\ndisk_total_mb=10000\ndisk_used_mb=2500\n",
    });
    const res = await run(usage, req(`/servers/${myServerId}/usage`, { secret }), { serverId: myServerId });
    expect(res.status).toBe(200);
    expect((await res.json()).usage).toMatchObject({
      serverId: myServerId,
      cpus: 4,
      cpuLoad: 1.5,
      memTotalMb: 2048,
      memUsedMb: 512,
      diskTotalMb: 10000,
      diskUsedMb: 2500,
    });
  });
});

describe("rate limits", () => {
  it("allows 120 reads a minute per token, then 429 with Retry-After", async () => {
    const secret = await token();
    for (let i = 0; i < 120; i++) expect((await run(listProjects, req("/projects", { secret }))).status).toBe(200);
    const res = await run(listProjects, req("/projects", { secret }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errorOf(res)).code).toBe("rate_limited");

    // Another token has its own allowance.
    const second = await token();
    expect((await run(listProjects, req("/projects", { secret: second }))).status).toBe(200);
  });

  it("allows 30 deploy-type writes a minute, separately from reads", async () => {
    const secret = await token();
    for (let i = 0; i < 30; i++) {
      expect((await run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST" }), { projectId })).status).toBe(202);
    }
    const blocked = await run(deploy, req(`/projects/${projectId}/deployments`, { secret, method: "POST" }), { projectId });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await run(listProjects, req("/projects", { secret }))).status).toBe(200);
  });

  it("does not spend a token's allowance on requests that failed authentication", async () => {
    const secret = await token();
    for (let i = 0; i < 150; i++) await run(listProjects, req("/projects", { secret: "ndp_wrong" }));
    expect((await run(listProjects, req("/projects", { secret }))).status).toBe(200);
  });
});

describe("OpenAPI", () => {
  it("is public and describes every endpoint from the shared list", async () => {
    const res = openapi();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");

    const ops = Object.values(doc.paths as Record<string, Record<string, { operationId: string; security: unknown[] }>>).flatMap((p) => Object.values(p));
    for (const ep of ENDPOINTS) {
      const op = doc.paths[ep.path][ep.method.toLowerCase()];
      expect(op.operationId).toBe(ep.id);
      expect(op.security).toEqual([{ bearerAuth: [ep.scope] }]);
      expect(Object.keys(op.responses)).toEqual(expect.arrayContaining([String(ep.status), "401", "403", "429"]));
    }
    expect(ops.map((o) => o.operationId).sort()).toEqual([...ENDPOINTS.map((e) => e.id), "get_openapi"].sort());
    expect(doc.paths["/openapi.json"].get.security).toEqual([]);
  });

  it("says what tokens cannot do, and does not describe any of it", async () => {
    const doc = await openapi().json();
    expect(doc.info.description).toMatch(/removing leftovers/);
    expect(doc.info.description).toMatch(/token management/);
    expect(doc.info.description).toMatch(/7 days/);
    // The terminal and files are allowed, under their own scopes: see api-v1-shell.test.ts.
    const paths = Object.keys(doc.paths).join(" ");
    for (const forbidden of ["orphans", "permissions", "sessions", "tokens", "account"]) {
      expect(paths).not.toContain(forbidden);
    }
  });

  it("links every schema reference to a defined component", async () => {
    const text = JSON.stringify(await openapi().json());
    const refs = [...text.matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]);
    const doc = JSON.parse(text);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(doc.components.schemas, r).toHaveProperty(r);
    expect(text).not.toContain("$defs");
  });
});
