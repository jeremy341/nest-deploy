import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiToken, SCOPES, type Scope } from "@/server/api-tokens";
import { ENDPOINTS } from "@/server/api-v1";
import { upsertUser } from "@/server/auth/session";
import { newId, sha256Hex } from "@/server/crypto";
import { schema } from "@/server/db";
import { setNotifications } from "@/server/notify";
import { createProject, deployBranch, revealEnvVar, setEnvVar } from "@/server/projects";
import { rateLimiter } from "@/server/rate-limit";
import { enableStatusPage } from "@/server/status-page";
import { useFreshDb } from "@/server/test/db";

// The route layer, the services and the database are real. Sign-in is replaced only so we can
// prove it is never consulted; SSH is a scripted session; DNS and the app probe are replaced
// because they would reach the network.
vi.mock("@/server/auth/current", () => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/server/servers", async (original) => {
  const real = await original<typeof import("@/server/servers")>();
  return { ...real, withServerSession: vi.fn() };
});
vi.mock("node:dns", async (original) => {
  const real = await original<typeof import("node:dns")>();
  return {
    ...real,
    default: real,
    promises: { ...real.promises, resolveCname: vi.fn(), resolve4: vi.fn() },
  };
});
vi.mock("@/server/app-check", async (original) => {
  const real = await original<typeof import("@/server/app-check")>();
  return { ...real, runAppCheck: vi.fn() };
});

import { promises as dns } from "node:dns";
import { runAppCheck } from "@/server/app-check";
import { getCurrentUser } from "@/server/auth/current";
import { createServer, withServerSession } from "@/server/servers";
import { GET as listProjectsRoute, POST as createProjectRoute } from "@/app/api/v1/projects/route";
import { DELETE as deleteProjectRoute, PATCH as updateProjectRoute } from "@/app/api/v1/projects/[projectId]/route";
import { GET as getDeploymentRoute } from "@/app/api/v1/deployments/[deploymentId]/route";
import { GET as deploymentLogsRoute } from "@/app/api/v1/deployments/[deploymentId]/logs/route";
import { GET as listEnvRoute } from "@/app/api/v1/projects/[projectId]/env/route";
import { DELETE as deleteEnvRoute, PUT as setEnvRoute } from "@/app/api/v1/projects/[projectId]/env/[key]/route";
import { GET as listDomainsRoute, POST as addDomainRoute } from "@/app/api/v1/domains/route";
import { DELETE as removeDomainRoute } from "@/app/api/v1/domains/[domainId]/route";
import { POST as verifyDomainRoute } from "@/app/api/v1/domains/[domainId]/verify/route";
import { DELETE as revokeHookRoute } from "@/app/api/v1/projects/[projectId]/hook/route";
import { POST as rotateHookRoute } from "@/app/api/v1/projects/[projectId]/hook/rotate/route";
import { GET as notifyRoute } from "@/app/api/v1/projects/[projectId]/notify/route";
import { POST as notifyTestRoute } from "@/app/api/v1/projects/[projectId]/notify/test/route";
import { GET as alertsRoute } from "@/app/api/v1/projects/[projectId]/alerts/route";
import { GET as statusPageRoute } from "@/app/api/v1/projects/[projectId]/status-page/route";
import { GET as analyticsRoute } from "@/app/api/v1/projects/[projectId]/analytics/route";
import { GET as projectResourcesRoute } from "@/app/api/v1/projects/[projectId]/resources/route";
import { GET as listServersRoute } from "@/app/api/v1/servers/route";
import { GET as inventoryRoute } from "@/app/api/v1/servers/[serverId]/inventory/route";
import { GET as usageHistoryRoute } from "@/app/api/v1/servers/[serverId]/usage/history/route";
import { GET as activityRoute } from "@/app/api/v1/activity/route";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string };
let other: { id: string };
let myServerId: string;
let theirServerId: string;
let projectId: string;
let theirProjectId: string;
let deploymentId: string;
let theirDeploymentId: string;
let domainId: string;
let theirDomainId: string;

// Values that must never come back in any response.
const ENV_SECRET = "env-secret-value-7f3a9c1d";
const NOTIFY_URL = "https://discord.com/api/webhooks/123456789012345678/AbC-dEf_SECRETWEBHOOKTOKEN99";
const NOTIFY_SECRET = "SECRETWEBHOOKTOKEN99";
// Planted straight into the audit log by a test, to prove the activity endpoint filters it.
const PLANTED_URL = "https://hooks.slack.com/services/T000AAA/B000BBB/PLANTEDWEBHOOKSECRET";
const EXEC_SECRET = "--api-key=sk_live_EXECSTARTSECRET";

const session = { script: vi.fn() };
let scriptReply: (command: string) => { code: number; stdout?: string; stderr?: string } = () => ({ code: 0, stdout: "" });

/** Every response body text, to sweep for secrets at the end. */
const bodies: string[] = [];
const issued: string[] = [];
/** Deploy hook URLs the rotate calls returned: shown once, and nowhere else. */
const hookUrlsSeen: string[] = [];

type Handler = (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Minted = { secret: string; id: string };
const mint = async (scopes: Scope[], userId = me.id): Promise<Minted> => {
  const made = await createApiToken(userId, { name: "t", scopes, expiresInDays: 7 });
  issued.push(made.secret);
  return { secret: made.secret, id: made.token.id };
};
const ALL: Scope[] = [...SCOPES];
const token = async (scopes: Scope[] = ALL) => (await mint(scopes)).secret;

const req = (path: string, init: { method?: string; secret?: string | null; body?: unknown } = {}) => {
  const headers: Record<string, string> = {};
  if (init.secret) headers.authorization = `Bearer ${init.secret}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000/api/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
};
const run = async (h: Handler, request: NextRequest, params: Record<string, string> = {}) => {
  const res = await h(request, { params: Promise.resolve(params) });
  bodies.push(await res.clone().text());
  return res;
};
const errorOf = async (res: Response) => {
  const body = await res.json();
  return { status: res.status, code: body.error?.code as string, message: body.error?.message as string };
};
const sshWasUsed = () => vi.mocked(withServerSession).mock.calls.length > 0;

const table = async (name: "projects" | "envVars" | "domains" | "auditLog" | "deployments") =>
  (await ctx.db.select().from(schema[name])).length;
const counts = async () => ({
  projects: await table("projects"),
  envVars: await table("envVars"),
  domains: await table("domains"),
  // Minting a token is itself audited; only changes made through the API count here.
  audit: (await ctx.db.select().from(schema.auditLog)).filter((r) => !r.action.startsWith("token.")).length,
  deployments: await table("deployments"),
});
const auditRows = async (action: string) =>
  (await ctx.db.select().from(schema.auditLog).where(and(eq(schema.auditLog.userId, me.id), eq(schema.auditLog.action, action)))).map((r) => ({
    ...r,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
  }));

const INVENTORY = [
  "home=/home/sam",
  "unit_dir=/etc/systemd/system",
  "has_systemctl=1",
  "disk_total_mb=10240",
  "disk_used_mb=4096",
  ["UNIT", "nd-app.service", "loaded", "active", "running", "4242", "/etc/systemd/system/nd-app.service", "/system.slice/nd-app.service", `/usr/bin/node server.js ${EXEC_SECRET}`].join("\t"),
  ["UNIT", "nd-ghost.service", "loaded", "failed", "failed", "0", "/etc/systemd/system/nd-ghost.service", "", ""].join("\t"),
  ["DIR", "app", "2048", "0"].join("\t"),
  ["DIR", "ghost", "100", "0"].join("\t"),
  "ports_format=none",
  "END=1",
].join("\n") + "\n";

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "x1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "x2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  myServerId = (await createServer(me.id, "sam-more")).id;
  theirServerId = (await createServer(other.id, "kim-more")).id;
  projectId = (await createProject(me.id, { ...base, serverId: myServerId, name: "App", slug: "app", port: 3000 })).id;
  theirProjectId = (await createProject(other.id, { ...base, serverId: theirServerId, name: "Theirs", slug: "theirs", port: 3001 })).id;
  deploymentId = (await deployBranch(me.id, projectId)).id;
  theirDeploymentId = (await deployBranch(other.id, theirProjectId)).id;
  domainId = newId();
  theirDomainId = newId();
  await ctx.db.insert(schema.domains).values([
    { id: domainId, userId: me.id, serverId: myServerId, projectId, domain: "app.example.com", port: 3000, status: "pending", createdAt: new Date() },
    { id: theirDomainId, userId: other.id, serverId: theirServerId, projectId: theirProjectId, domain: "theirs.example.com", port: 3001, status: "pending", createdAt: new Date() },
  ]);
  // Secrets that exist in the database and must stay there.
  await setEnvVar(me.id, projectId, { key: "API_KEY", value: ENV_SECRET, target: "production" });
  await setEnvVar(other.id, theirProjectId, { key: "THEIR_KEY", value: "their-secret-value", target: "all" });
  await setNotifications(me.id, projectId, { url: NOTIFY_URL, on: "failures" });
  await ctx.db.insert(schema.deploymentLogs).values([
    { deploymentId, at: new Date(Date.now() - 3000), level: "info", message: "Cloning" },
    { deploymentId, at: new Date(Date.now() - 2000), level: "warn", message: "Slow install" },
    { deploymentId, at: new Date(Date.now() - 1000), level: "error", message: "Build failed" },
  ]);
  await ctx.db.insert(schema.alertEvents).values({
    id: newId(),
    projectId,
    type: "down",
    message: "App is not answering",
    firedAt: new Date(),
    muted: false,
  });
  const now = Date.now();
  await ctx.db.insert(schema.usageSamples).values(
    [0, 1, 2, 3].map((i) => ({
      serverId: myServerId,
      at: new Date(now - i * 600_000),
      cpuLoad: 0.5,
      cpus: 2,
      memUsedMb: 512,
      memTotalMb: 2048,
      diskUsedMb: 1000,
      diskTotalMb: 10000,
    }))
  );
  await ctx.db.insert(schema.projectSamples).values(
    [0, 1, 2].map((i) => ({ projectId, at: new Date(now - i * 600_000), memMb: 100 + i, cpuPercent: 5 + i, cpuNs: 1, restarts: 1 }))
  );
  await ctx.db.insert(schema.pageviews).values([
    { projectId, at: new Date(), path: "/", referrer: "news.example.org", visitor: "v1" },
    { projectId, at: new Date(), path: "/", referrer: null, visitor: "v2" },
    { projectId, at: new Date(), path: "/about", referrer: "news.example.org", visitor: "v1" },
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
  vi.mocked(dns.resolveCname).mockReset();
  vi.mocked(dns.resolve4).mockReset();
  vi.mocked(runAppCheck).mockReset();
});

// --------------------------------------------------------------- the table

type Ids = { projectId: string; deploymentId: string; serverId: string; domainId: string };
type Spec = {
  scope: Scope;
  handler: Handler;
  method: string;
  path: (i: Ids) => string;
  params: (i: Ids) => Record<string, string>;
  body?: (i: Ids) => unknown;
  /** The call should be refused (404) when the ids belong to someone else. */
  owned?: boolean;
};

const mine: Ids = { get projectId() { return projectId; }, get deploymentId() { return deploymentId; }, get serverId() { return myServerId; }, get domainId() { return domainId; } };
const theirs: Ids = { get projectId() { return theirProjectId; }, get deploymentId() { return theirDeploymentId; }, get serverId() { return theirServerId; }, get domainId() { return theirDomainId; } };

const proj = (suffix: string) => (i: Ids) => `/projects/${i.projectId}${suffix}`;
const projParams = (i: Ids) => ({ projectId: i.projectId });

const SPECS: Record<string, Spec> = {
  create_project: {
    scope: "projects:write", handler: createProjectRoute, method: "POST", path: () => "/projects", params: () => ({}),
    body: (i) => ({ serverId: i.serverId, name: "Fresh", repoUrl: "https://github.com/sam/fresh.git", runtime: "node", port: 3900 }),
    owned: true,
  },
  update_project: { scope: "projects:write", handler: updateProjectRoute, method: "PATCH", path: proj(""), params: projParams, body: () => ({ healthPath: "/up" }), owned: true },
  delete_project: { scope: "projects:write", handler: deleteProjectRoute, method: "DELETE", path: proj(""), params: projParams, owned: true },
  get_deployment: { scope: "deployments:read", handler: getDeploymentRoute, method: "GET", path: (i) => `/deployments/${i.deploymentId}`, params: (i) => ({ deploymentId: i.deploymentId }), owned: true },
  get_deployment_logs: { scope: "deployments:read", handler: deploymentLogsRoute, method: "GET", path: (i) => `/deployments/${i.deploymentId}/logs`, params: (i) => ({ deploymentId: i.deploymentId }), owned: true },
  list_env_vars: { scope: "env:read", handler: listEnvRoute, method: "GET", path: proj("/env"), params: projParams, owned: true },
  set_env_var: { scope: "env:write", handler: setEnvRoute, method: "PUT", path: proj("/env/NEW_KEY"), params: (i) => ({ projectId: i.projectId, key: "NEW_KEY" }), body: () => ({ value: "x" }), owned: true },
  delete_env_var: { scope: "env:write", handler: deleteEnvRoute, method: "DELETE", path: proj("/env/API_KEY"), params: (i) => ({ projectId: i.projectId, key: "API_KEY" }), owned: true },
  add_domain: {
    scope: "domains:write", handler: addDomainRoute, method: "POST", path: () => "/domains", params: () => ({}),
    body: (i) => ({ serverId: i.serverId, domain: "new.example.com", port: 3000, projectId: i.projectId }), owned: true,
  },
  verify_domain: { scope: "domains:write", handler: verifyDomainRoute, method: "POST", path: (i) => `/domains/${i.domainId}/verify`, params: (i) => ({ domainId: i.domainId }), owned: true },
  remove_domain: { scope: "domains:write", handler: removeDomainRoute, method: "DELETE", path: (i) => `/domains/${i.domainId}`, params: (i) => ({ domainId: i.domainId }), owned: true },
  rotate_deploy_hook: { scope: "deployments:write", handler: rotateHookRoute, method: "POST", path: proj("/hook/rotate"), params: projParams, owned: true },
  revoke_deploy_hook: { scope: "deployments:write", handler: revokeHookRoute, method: "DELETE", path: proj("/hook"), params: projParams, owned: true },
  get_notifications: { scope: "notifications:read", handler: notifyRoute, method: "GET", path: proj("/notify"), params: projParams, owned: true },
  test_notification: { scope: "notifications:read", handler: notifyTestRoute, method: "POST", path: proj("/notify/test"), params: projParams, owned: true },
  get_alerts: { scope: "alerts:read", handler: alertsRoute, method: "GET", path: proj("/alerts"), params: projParams, owned: true },
  get_status_page: { scope: "projects:read", handler: statusPageRoute, method: "GET", path: proj("/status-page"), params: projParams, owned: true },
  get_analytics: { scope: "analytics:read", handler: analyticsRoute, method: "GET", path: proj("/analytics"), params: projParams, owned: true },
  get_resource_history: { scope: "resources:read", handler: usageHistoryRoute, method: "GET", path: (i) => `/servers/${i.serverId}/usage/history`, params: (i) => ({ serverId: i.serverId }), owned: true },
  get_project_resources: { scope: "resources:read", handler: projectResourcesRoute, method: "GET", path: proj("/resources"), params: projParams, owned: true },
  list_servers: { scope: "container:read", handler: listServersRoute, method: "GET", path: () => "/servers", params: () => ({}) },
  get_container_inventory: { scope: "container:read", handler: inventoryRoute, method: "GET", path: (i) => `/servers/${i.serverId}/inventory`, params: (i) => ({ serverId: i.serverId }), owned: true },
  get_activity: { scope: "activity:read", handler: activityRoute, method: "GET", path: () => "/activity", params: () => ({}) },
};

const callSpec = (spec: Spec, ids: Ids, secret: string | null) =>
  run(spec.handler, req(spec.path(ids), { method: spec.method, secret, body: spec.body?.(ids) }), spec.params(ids));

const FIRST = ["list_projects", "get_project", "list_deployments", "deploy_branch", "redeploy", "cancel_deployment", "rollback_deployment", "get_logs", "list_domains", "get_server_usage"];

describe("the endpoint list", () => {
  it("covers every endpoint added after the first ten, apart from the terminal and files", () => {
    const expected = ENDPOINTS.filter((e) => !FIRST.includes(e.id) && e.tag !== "Terminal" && e.tag !== "Files").map((e) => e.id);
    expect(Object.keys(SPECS).sort()).toEqual(expected.sort());
  });

  it("declares in the table the scope each endpoint really needs", () => {
    for (const ep of ENDPOINTS) {
      if (SPECS[ep.id]) expect(SPECS[ep.id].scope, ep.id).toBe(ep.scope);
    }
  });

  it("puts every SSH-using endpoint in the small bucket and every change in the write bucket", () => {
    const byId = new Map(ENDPOINTS.map((e) => [e.id, e]));
    for (const id of ["get_container_inventory", "get_deployment_logs", "get_resource_history", "get_project_resources"]) {
      expect(byId.get(id)!.bucket, id).toBe("ssh");
    }
    for (const ep of ENDPOINTS.filter((e) => !e.readOnly && e.tag !== "Terminal" && e.tag !== "Files")) {
      expect(ep.bucket, ep.id).toBe("write");
    }
  });
});

describe("authentication and scopes", () => {
  it("answers 401 without a token and never consults the browser session", async () => {
    for (const [id, spec] of Object.entries(SPECS)) {
      const res = await callSpec(spec, mine, null);
      expect(res.status, id).toBe(401);
      expect(res.headers.get("www-authenticate"), id).toBe("Bearer");
    }
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(sshWasUsed()).toBe(false);
  });

  it("answers 403 naming the scope when a token lacks it, before doing anything", async () => {
    const before = await counts();
    for (const [id, spec] of Object.entries(SPECS)) {
      const without = await token(ALL.filter((s) => s !== spec.scope));
      const res = await callSpec(spec, mine, without);
      const e = await errorOf(res);
      expect(res.status, id).toBe(403);
      expect(e.code, id).toBe("forbidden");
      expect(e.message, id).toContain(spec.scope);
    }
    expect(await counts()).toEqual(before);
    expect(sshWasUsed()).toBe(false);
  });

  it("does not let a read scope act as the matching write scope", async () => {
    const secret = await token(["env:read", "projects:read", "domains:read", "deployments:read"]);
    const before = await counts();
    for (const id of ["set_env_var", "delete_env_var", "create_project", "update_project", "delete_project", "add_domain", "remove_domain", "verify_domain", "rotate_deploy_hook", "revoke_deploy_hook"]) {
      expect((await callSpec(SPECS[id], mine, secret)).status, id).toBe(403);
    }
    expect(await counts()).toEqual(before);
  });
});

describe("ownership", () => {
  it("answers 404 for another user's project, deployment, server and domain, and changes nothing", async () => {
    const secret = await token();
    const before = await counts();
    for (const [id, spec] of Object.entries(SPECS)) {
      if (!spec.owned) continue;
      const res = await callSpec(spec, theirs, secret);
      expect(await errorOf(res), id).toMatchObject({ status: 404, code: "not_found" });
    }
    // Unknown ids look exactly the same.
    const ghost: Ids = { projectId: "no-such-id", deploymentId: "no-such-id", serverId: "no-such-id", domainId: "no-such-id" };
    for (const [id, spec] of Object.entries(SPECS)) {
      if (!spec.owned || id === "create_project" || id === "add_domain") continue;
      const res = await callSpec(spec, ghost, secret);
      expect(await errorOf(res), `ghost ${id}`).toMatchObject({ status: 404, code: "not_found" });
    }
    expect(await counts()).toEqual(before);
    expect(sshWasUsed()).toBe(false);
    expect(await ctx.db.select().from(schema.envVars).where(eq(schema.envVars.projectId, theirProjectId))).toHaveLength(1);
    expect((await ctx.db.select().from(schema.domains).where(eq(schema.domains.id, theirDomainId)))).toHaveLength(1);
  });

  it("does not let a project in the body point at someone else's project or server", async () => {
    const secret = await token();
    const bad = await run(addDomainRoute, req("/domains", { secret, method: "POST", body: { serverId: myServerId, domain: "x.example.com", port: 3000, projectId: theirProjectId } }));
    expect(bad.status).toBe(404);
    expect((await ctx.db.select().from(schema.domains).where(eq(schema.domains.domain, "x.example.com")))).toHaveLength(0);
  });

  it("lists only the caller's servers", async () => {
    const res = await run(listServersRoute, req("/servers", { secret: await token() }));
    const { servers } = await res.json();
    expect(servers.map((s: { id: string }) => s.id)).toEqual([myServerId]);
  });
});

// --------------------------------------------------------------- projects

describe("create, change and delete a project", () => {
  it("creates a project on the caller's server, audits it with the token, and returns the public shape", async () => {
    const t = await mint(["projects:write", "projects:read"]);
    const res = await run(createProjectRoute, req("/projects", { secret: t.secret, method: "POST", body: { serverId: myServerId, name: "Fresh Site", repoUrl: "https://github.com/sam/fresh.git", runtime: "static", port: 3901, outputDir: "dist" } }));
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project).toMatchObject({ slug: "fresh-site", name: "Fresh Site", branch: "main", runtime: "static", port: 3901, autoDeploy: true, serverId: myServerId, state: null, latestDeployment: null, repo: null });
    for (const hidden of ["hookActive", "analyticsKey", "nestUsername", "repoUrl", "installationId"]) expect(project).not.toHaveProperty(hidden);

    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get();
    expect(row).toMatchObject({ userId: me.id, installationId: null, repoFullName: null, outputDir: "dist" });
    const [entry] = (await auditRows("project.create")).filter((r) => r.target === project.id);
    expect(entry.meta).toMatchObject({ name: "Fresh Site", via: "api", token: t.id });
    expect(JSON.stringify(entry)).not.toContain(t.secret);
  });

  it("refuses a repeated slug, a used port, a bad host, and fields it does not accept", async () => {
    const secret = await token();
    const base = { serverId: myServerId, name: "Dup", repoUrl: "https://github.com/sam/dup.git", runtime: "node", port: 3902 };
    const post = (body: unknown) => run(createProjectRoute, req("/projects", { secret, method: "POST", body }));
    expect((await post({ ...base, slug: "app" })).status).toBe(409);
    expect((await post({ ...base, port: 3000 })).status).toBe(409);
    for (const bad of [
      { ...base, repoUrl: "https://evil.example/x.git" },
      { ...base, repoUrl: "http://github.com/sam/x.git" },
      { ...base, port: 22 },
      { ...base, port: 20500 },
      { ...base, runtime: "cobol" },
      { ...base, installationId: 5 },
      { ...base, repoFullName: "other/private" },
      { ...base, userId: other.id },
      { ...base, startCommand: "a\nb" },
      { ...base, name: "" },
      {},
      "not json",
    ]) {
      expect((await post(bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(await ctx.db.select().from(schema.projects).where(eq(schema.projects.name, "Dup"))).toHaveLength(0);
  });

  it("changes only the settings that were sent, and does not reset the others to their defaults", async () => {
    const t = await mint(["projects:write", "projects:read"]);
    await ctx.db.update(schema.projects).set({ autoDeploy: false, healthPath: "/custom", productionBranch: "trunk", rootDir: "web" }).where(eq(schema.projects.id, projectId));

    const res = await run(updateProjectRoute, req(`/projects/${projectId}`, { secret: t.secret, method: "PATCH", body: { startCommand: "node server.js" } }), { projectId });
    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({ startCommand: "node server.js", autoDeploy: false, healthPath: "/custom", branch: "trunk" });
    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    expect(row).toMatchObject({ rootDir: "web", autoDeploy: false, healthPath: "/custom", productionBranch: "trunk", startCommand: "node server.js" });

    const entries = (await auditRows("project.update")).filter((r) => r.meta?.token === t.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].meta).toMatchObject({ fields: "startCommand", via: "api" });

    // Null puts a command back to its default, and a port can move.
    const cleared = await run(updateProjectRoute, req(`/projects/${projectId}`, { secret: t.secret, method: "PATCH", body: { startCommand: null, port: 3050, autoDeploy: true } }), { projectId });
    expect((await cleared.json()).project).toMatchObject({ startCommand: null, port: 3050, autoDeploy: true });

    await ctx.db.update(schema.projects).set({ autoDeploy: true, healthPath: "/", productionBranch: "main", rootDir: ".", port: 3000 }).where(eq(schema.projects.id, projectId));
  });

  it("refuses an empty change, a clashing or reserved port, and unknown or unsafe fields", async () => {
    const secret = await token();
    const patch = (body: unknown) => run(updateProjectRoute, req(`/projects/${projectId}`, { secret, method: "PATCH", body }), { projectId });
    for (const body of [{}, { port: 22 }, { port: 25000 }, { buildCommand: "a\nb" }, { productionBranch: "--x" }, { healthPath: "nope" }, { name: "Renamed" }, { runtime: "python" }, { serverId: theirServerId }, { slug: "x" }, { port: "3000" }]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    const clash = await run(createProjectRoute, req("/projects", { secret, method: "POST", body: { serverId: myServerId, name: "Other port", repoUrl: "https://github.com/sam/o.git", runtime: "node", port: 3905 } }));
    const otherId = (await clash.json()).project.id as string;
    expect((await run(updateProjectRoute, req(`/projects/${otherId}`, { secret, method: "PATCH", body: { port: 3000 } }), { projectId: otherId })).status).toBe(409);
  });

  it("deletes records only by default, and audits it with the token", async () => {
    const t = await mint(["projects:write"]);
    const doomed = await createProject(me.id, { serverId: myServerId, name: "Doomed", repoUrl: "https://github.com/sam/d.git", runtime: "node", port: 3910 });
    const res = await run(deleteProjectRoute, req(`/projects/${doomed.id}`, { secret: t.secret, method: "DELETE" }), { projectId: doomed.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, projectId: doomed.id, removedFromServer: false });
    expect(await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, doomed.id))).toHaveLength(0);
    expect(sshWasUsed()).toBe(false);
    const [entry] = (await auditRows("project.delete")).filter((r) => r.meta?.token === t.id);
    expect(entry.meta).toMatchObject({ name: "Doomed", via: "api", removedFromServer: false });
  });

  it("also removes the app from the container only when asked, and keeps the project if that fails", async () => {
    const secret = await token();
    const doomed = await createProject(me.id, { serverId: myServerId, name: "Doomed Two", repoUrl: "https://github.com/sam/d2.git", runtime: "node", port: 3911 });
    scriptReply = () => ({ code: 0, stdout: "home=/home/sam\nuid=0\n" });
    const ok = await run(deleteProjectRoute, req(`/projects/${doomed.id}?removeFromServer=true`, { secret, method: "DELETE" }), { projectId: doomed.id });
    expect(ok.status).toBe(200);
    expect((await ok.json()).removedFromServer).toBe(true);
    expect(sshWasUsed()).toBe(true);
    expect(await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, doomed.id))).toHaveLength(0);

    const stays = await createProject(me.id, { serverId: myServerId, name: "Stays", repoUrl: "https://github.com/sam/s.git", runtime: "node", port: 3912 });
    scriptReply = (command) => (command.includes("rm") || command.includes("systemctl") ? { code: 7, stderr: "/home/sam/secret path" } : { code: 0, stdout: "home=/home/sam\nuid=0\n" });
    const failed = await run(deleteProjectRoute, req(`/projects/${stays.id}?removeFromServer=true`, { secret, method: "DELETE" }), { projectId: stays.id });
    expect(failed.status).toBe(502);
    expect((await failed.text())).not.toContain("secret path");
    expect(await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, stays.id))).toHaveLength(1);

    for (const bad of ["maybe", "1", ""]) {
      expect((await run(deleteProjectRoute, req(`/projects/${stays.id}?removeFromServer=${bad}`, { secret, method: "DELETE" }), { projectId: stays.id })).status, bad).toBe(400);
    }
    await ctx.db.delete(schema.projects).where(eq(schema.projects.id, stays.id));
  });

  it("takes removeFromServer from the small SSH allowance too", async () => {
    const secret = await token();
    scriptReply = () => ({ code: 0, stdout: "home=/home/sam\nuid=0\n" });
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      ids.push((await createProject(me.id, { serverId: myServerId, name: `Bulk ${i}`, repoUrl: "https://github.com/sam/b.git", runtime: "node", port: 3920 + i })).id);
    }
    const statuses: number[] = [];
    for (const id of ids) {
      statuses.push((await run(deleteProjectRoute, req(`/projects/${id}?removeFromServer=true`, { secret, method: "DELETE" }), { projectId: id })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    for (const id of ids) await ctx.db.delete(schema.projects).where(eq(schema.projects.id, id));
  });
});

// ------------------------------------------------------------ build output

describe("deployment detail and build output", () => {
  it("returns one deployment with its times", async () => {
    const res = await run(getDeploymentRoute, req(`/deployments/${deploymentId}`, { secret: await token(["deployments:read"]) }), { deploymentId });
    expect(res.status).toBe(200);
    expect((await res.json()).deployment).toMatchObject({ id: deploymentId, projectId, state: "queued", env: "production", startedAt: null, finishedAt: null, port: 3000 });
  });

  it("returns build lines oldest first, can continue after a line id, and caps the page", async () => {
    const secret = await token(["deployments:read"]);
    const get = (q: string) => run(deploymentLogsRoute, req(`/deployments/${deploymentId}/logs${q}`, { secret }), { deploymentId });
    const all = await (await get("")).json();
    expect(all.lines.map((l: { message: string }) => l.message)).toEqual(["Cloning", "Slow install", "Build failed"]);
    expect(all.lines[2].level).toBe("error");
    expect(all.more).toBe(false);
    expect(all.nextAfter).toBe(all.lines[2].id);

    const rest = await (await get(`?after=${all.lines[0].id}`)).json();
    expect(rest.lines).toHaveLength(2);
    const page = await (await get("?limit=1")).json();
    expect(page.lines).toHaveLength(1);
    expect(page.more).toBe(true);
    const none = await (await get(`?after=${all.nextAfter}`)).json();
    expect(none).toMatchObject({ lines: [], more: false, nextAfter: all.nextAfter });
    for (const bad of ["?limit=0", "?limit=1001", "?after=-1", "?after=x"]) expect((await get(bad)).status, bad).toBe(400);
    expect(sshWasUsed()).toBe(false);
  });
});

// ------------------------------------------------------- environment variables

describe("environment variables", () => {
  it("lists names and targets only", async () => {
    const res = await run(listEnvRoute, req(`/projects/${projectId}/env`, { secret: await token(["env:read"]) }), { projectId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ env: [{ key: "API_KEY", target: "production" }] });
  });

  it("sets a variable write-only, stores it sealed, audits it with the token, and never echoes the value", async () => {
    const t = await mint(["env:write", "env:read"]);
    const value = "another-secret-value-5d2e";
    const res = await run(setEnvRoute, req(`/projects/${projectId}/env/DB_URL`, { secret: t.secret, method: "PUT", body: { value, target: "preview" } }), { projectId, key: "DB_URL" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ env: { key: "DB_URL", target: "preview" } });
    expect(await revealEnvVar(projectId, "DB_URL", "preview")).toBe(value);
    const stored = await ctx.db.select().from(schema.envVars).where(eq(schema.envVars.key, "DB_URL")).get();
    expect(stored!.valueEnc).not.toContain(value);

    const [entry] = (await auditRows("env.set")).filter((r) => r.meta?.token === t.id);
    expect(entry.meta).toMatchObject({ name: "DB_URL", target: "preview", via: "api" });
    expect(JSON.stringify(entry)).not.toContain(value);
    bodies.push(JSON.stringify(entry));

    // Replacing keeps one entry per name and target.
    await run(setEnvRoute, req(`/projects/${projectId}/env/DB_URL`, { secret: t.secret, method: "PUT", body: { value: "v2", target: "preview" } }), { projectId, key: "DB_URL" });
    expect(await ctx.db.select().from(schema.envVars).where(and(eq(schema.envVars.projectId, projectId), eq(schema.envVars.key, "DB_URL")))).toHaveLength(1);
    expect(await revealEnvVar(projectId, "DB_URL", "preview")).toBe("v2");
    // Without a target it is for everything.
    await run(setEnvRoute, req(`/projects/${projectId}/env/DB_URL`, { secret: t.secret, method: "PUT", body: { value: "v3" } }), { projectId, key: "DB_URL" });
    expect(await revealEnvVar(projectId, "DB_URL", "all")).toBe("v3");
  });

  it("refuses bad names, reserved names, bad targets, big values and unknown fields without echoing the value", async () => {
    const secret = await token(["env:write"]);
    const put = (key: string, body: unknown) => run(setEnvRoute, req(`/projects/${projectId}/env/${key}`, { secret, method: "PUT", body }), { projectId, key });
    const leaky = "leaky-value-should-not-appear-in-errors";
    for (const [key, body] of [
      ["1BAD", { value: leaky }],
      ["PORT", { value: leaky }],
      ["path", { value: leaky }],
      ["OK_KEY", { value: leaky, target: "staging" }],
      ["OK_KEY", { value: "x".repeat(10_001) }],
      ["OK_KEY", { val: leaky }],
      ["OK_KEY", { value: 5 }],
      ["OK_KEY", {}],
      ["OK_KEY", { value: leaky, key: "OTHER" }],
      ["has-dash", { value: leaky }],
    ] as const) {
      const res = await put(key, body);
      expect(res.status, `${key} ${JSON.stringify(body).slice(0, 40)}`).toBe(400);
      expect(await res.text()).not.toContain(leaky);
    }
  });

  it("removes one target's entry or every entry of a name, and says when there is none", async () => {
    const t = await mint(["env:write", "env:read"]);
    for (const target of ["production", "preview"]) {
      await setEnvVar(me.id, projectId, { key: "TMP_VAR", value: "tmp", target });
    }
    const del = (q: string) => run(deleteEnvRoute, req(`/projects/${projectId}/env/TMP_VAR${q}`, { secret: t.secret, method: "DELETE" }), { projectId, key: "TMP_VAR" });
    const one = await del("?target=preview");
    expect(one.status).toBe(200);
    expect((await one.json()).deleted).toEqual([{ key: "TMP_VAR", target: "preview" }]);
    expect(await revealEnvVar(projectId, "TMP_VAR", "production")).toBe("tmp");
    const rest = await del("");
    expect((await rest.json()).deleted).toEqual([{ key: "TMP_VAR", target: "production" }]);
    expect((await del("")).status).toBe(404);
    expect((await del("?target=nope")).status).toBe(400);
    const entries = (await auditRows("env.delete")).filter((r) => r.meta?.token === t.id);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].meta).toMatchObject({ name: "TMP_VAR", via: "api" });
    // The other variables are untouched.
    expect(await revealEnvVar(projectId, "API_KEY", "production")).toBe(ENV_SECRET);
  });
});

// ------------------------------------------------------------------- domains

describe("domains", () => {
  it("adds a domain with instructions, audits it with the token, and refuses a repeat", async () => {
    const t = await mint(["domains:write", "domains:read"]);
    const body = { serverId: myServerId, domain: "Docs.Example.com", port: 3000, projectId };
    const res = await run(addDomainRoute, req("/domains", { secret: t.secret, method: "POST", body }));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.domain).toMatchObject({ domain: "docs.example.com", status: "pending", port: 3000, projectId, serverId: myServerId, cname: "sam-more.hackclub.app" });
    expect(out.instructions.cname).toEqual({ name: "docs.example.com", value: "sam-more.hackclub.app" });
    expect(out.instructions.steps.length).toBeGreaterThan(1);

    const [entry] = (await auditRows("domain.add")).filter((r) => r.meta?.token === t.id);
    expect(entry.meta).toMatchObject({ domain: "docs.example.com", via: "api" });

    expect((await run(addDomainRoute, req("/domains", { secret: t.secret, method: "POST", body }))).status).toBe(409);
    const listed = await (await run(listDomainsRoute, req("/domains", { secret: t.secret }))).json();
    expect(listed.domains.map((d: { domain: string }) => d.domain)).toContain("docs.example.com");

    for (const bad of [
      { ...body, domain: "http://x.example.com" },
      { ...body, domain: "10.0.0.1" },
      { ...body, domain: "localhost" },
      { ...body, port: 0 },
      { ...body, port: 70000 },
      { ...body, domain: "ok2.example.com", extra: 1 },
      { serverId: myServerId },
    ]) {
      expect((await run(addDomainRoute, req("/domains", { secret: t.secret, method: "POST", body: bad }))).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("verifies DNS and the app, records the status, and reports a skipped app check", async () => {
    const secret = await token(["domains:write", "domains:read"]);
    const verify = () => run(verifyDomainRoute, req(`/domains/${domainId}/verify`, { secret, method: "POST" }), { domainId });

    vi.mocked(dns.resolveCname).mockResolvedValue(["wrong.example.net"]);
    const bad = await (await verify()).json();
    expect(bad).toMatchObject({ status: "invalid", app: { skipped: true, certificateVerified: false, answers: [] } });
    expect(bad.reason).toContain("sam-more.hackclub.app");
    expect(runAppCheck).not.toHaveBeenCalled();

    vi.mocked(dns.resolveCname).mockResolvedValue(["sam-more.hackclub.app."]);
    vi.mocked(runAppCheck).mockResolvedValue({
      certificateVerified: true,
      certificateLabel: "Certificate verified",
      answers: [{ path: "/", statusCode: 200, ok: true, message: "Answers with HTTP 200" }],
      problem: null,
    });
    const good = await (await verify()).json();
    expect(good).toMatchObject({ status: "valid", reason: null, app: { skipped: false, certificateVerified: true, answers: [{ statusCode: 200 }], problem: null } });
    const listed = await (await run(listDomainsRoute, req("/domains", { secret }))).json();
    expect(listed.domains.find((d: { id: string }) => d.id === domainId).status).toBe("valid");
    expect(sshWasUsed()).toBe(false);
  });

  it("removes a domain and audits it with the token", async () => {
    const t = await mint(["domains:write"]);
    const added = await (await run(addDomainRoute, req("/domains", { secret: t.secret, method: "POST", body: { serverId: myServerId, domain: "gone.example.com", port: 3000 } }))).json();
    const res = await run(removeDomainRoute, req(`/domains/${added.domain.id}`, { secret: t.secret, method: "DELETE" }), { domainId: added.domain.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true, domainId: added.domain.id });
    expect(await ctx.db.select().from(schema.domains).where(eq(schema.domains.id, added.domain.id))).toHaveLength(0);
    expect((await auditRows("domain.remove")).some((r) => r.meta?.token === t.id && r.meta?.domain === "gone.example.com")).toBe(true);
    expect((await run(removeDomainRoute, req(`/domains/${added.domain.id}`, { secret: t.secret, method: "DELETE" }), { domainId: added.domain.id })).status).toBe(404);
  });
});

// ----------------------------------------------------------------- deploy hook

describe("the deploy hook", () => {
  it("returns the URL once, when it is made, and never again", async () => {
    const t = await mint(["deployments:write", "projects:read", "deployments:read"]);
    const first = await run(rotateHookRoute, req(`/projects/${projectId}/hook/rotate`, { secret: t.secret, method: "POST" }), { projectId });
    expect(first.status).toBe(201);
    const { hook } = await first.json();
    expect(hook.url).toMatch(/^http:\/\/localhost:3000\/api\/hooks\/deploy\/ndh_[A-Za-z0-9_-]+$/);
    const hookToken = hook.url.split("/").pop() as string;
    // Only a hash is stored.
    const row = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    expect(row!.hookHash).toBe(sha256Hex(hookToken));
    expect(JSON.stringify(row)).not.toContain(hookToken);

    const [entry] = (await auditRows("hook.create")).filter((r) => r.meta?.token === t.id);
    expect(entry.meta).toMatchObject({ via: "api" });
    expect(JSON.stringify(entry)).not.toContain(hookToken);

    // Nothing that reads afterwards shows it.
    const project = await run(listProjectsRoute, req("/projects", { secret: t.secret }));
    const after = await (await run(rotateHookRoute, req(`/projects/${projectId}/hook/rotate`, { secret: t.secret, method: "POST" }), { projectId })).json();
    expect(after.hook.url).not.toBe(hook.url);
    expect(await project.text()).not.toContain("ndh_");
    const replaced = await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    expect(replaced!.hookHash).toBe(sha256Hex(after.hook.url.split("/").pop()));
    expect(replaced!.hookHash).not.toBe(sha256Hex(hookToken));

    // The two hook responses are the only ones that carry a hook URL: take them out of the sweep.
    const urls = [hook.url, after.hook.url];
    for (let i = bodies.length - 1; i >= 0; i--) if (urls.some((u) => bodies[i].includes(u))) bodies.splice(i, 1);
    hookUrlsSeen.push(...urls);
  });

  it("revokes it, and is happy to revoke one that is not there", async () => {
    const t = await mint(["deployments:write"]);
    const res = await run(revokeHookRoute, req(`/projects/${projectId}/hook`, { secret: t.secret, method: "DELETE" }), { projectId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true, projectId });
    expect((await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get())!.hookHash).toBeNull();
    expect((await auditRows("hook.revoke")).some((r) => r.meta?.token === t.id)).toBe(true);
    expect((await run(revokeHookRoute, req(`/projects/${projectId}/hook`, { secret: t.secret, method: "DELETE" }), { projectId })).status).toBe(200);
  });
});

// ------------------------------------------------- notifications, alerts, status

describe("notifications, alerts and the status page", () => {
  it("says which service posts and when, never the webhook URL", async () => {
    const secret = await token(["notifications:read"]);
    const set = await (await run(notifyRoute, req(`/projects/${projectId}/notify`, { secret }), { projectId })).json();
    expect(set).toEqual({ notifications: { configured: true, kind: "discord", on: "failures" } });
    await ctx.db.insert(schema.projects).values({ ...(await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get())!, id: "plain-project", slug: "plain", name: "Plain", port: 3999, notifyUrlEnc: null });
    const none = await (await run(notifyRoute, req("/projects/plain-project/notify", { secret }), { projectId: "plain-project" })).json();
    expect(none).toEqual({ notifications: { configured: false, kind: null, on: null } });
    await ctx.db.delete(schema.projects).where(eq(schema.projects.id, "plain-project"));
  });

  it("sends a test message through the real service, and fails plainly without a webhook", async () => {
    const secret = await token(["notifications:read"]);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await run(notifyTestRoute, req(`/projects/${projectId}/notify/test`, { secret, method: "POST" }), { projectId });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(NOTIFY_URL);

      fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
      const refused = await run(notifyTestRoute, req(`/projects/${projectId}/notify/test`, { secret, method: "POST" }), { projectId });
      expect(refused.status).toBe(502);
    } finally {
      vi.unstubAllGlobals();
    }
    const { id: bareId } = await createProject(me.id, { serverId: myServerId, name: "Bare", repoUrl: "https://github.com/sam/bare.git", runtime: "node", port: 3930 });
    const none = await run(notifyTestRoute, req(`/projects/${bareId}/notify/test`, { secret, method: "POST" }), { projectId: bareId });
    expect(none.status).toBe(400);
    await ctx.db.delete(schema.projects).where(eq(schema.projects.id, bareId));
  });

  it("reads alert thresholds, channels, mute state and recent events", async () => {
    const res = await run(alertsRoute, req(`/projects/${projectId}/alerts`, { secret: await token(["alerts:read"]) }), { projectId });
    expect(res.status).toBe(200);
    const { settings, history } = await res.json();
    expect(settings).toMatchObject({ diskPct: 90, memoryPct: 90, cpuPct: 90, channels: { down: true, deploy: true }, mute: { active: false, forever: false, until: null } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: "down", message: "App is not answering", resolvedAt: null, muted: false });
  });

  it("reads the status page: unpublished, then published with its public URL", async () => {
    const secret = await token(["projects:read"]);
    const get = () => run(statusPageRoute, req(`/projects/${projectId}/status-page`, { secret }), { projectId });
    expect(await (await get()).json()).toEqual({ statusPage: { published: false, url: null } });
    const { url } = await enableStatusPage(me.id, projectId);
    expect(await (await get()).json()).toEqual({ statusPage: { published: true, url } });
    expect(url).toMatch(/^http:\/\/localhost:3000\/status\//);
  });
});

// --------------------------------------------------------- analytics, resources

describe("analytics and resource history", () => {
  it("returns totals, one entry per day, top pages and referrers for 1 to 90 days", async () => {
    const secret = await token(["analytics:read"]);
    const get = (q = "") => run(analyticsRoute, req(`/projects/${projectId}/analytics${q}`, { secret }), { projectId });
    const out = (await (await get()).json()).analytics;
    expect(out).toMatchObject({ days: 30, views: 3, visitors: 2 });
    expect(out.daily).toHaveLength(30);
    expect(out.pages[0]).toEqual({ path: "/", views: 2 });
    expect(out.referrers).toEqual([{ host: "news.example.org", views: 2 }]);
    expect((await (await get("?days=7")).json()).analytics.daily).toHaveLength(7);
    for (const bad of ["?days=0", "?days=91", "?days=x", "?days=1.5"]) expect((await get(bad)).status, bad).toBe(400);
  });

  it("returns server usage history as shares, oldest first, within the hour range, without opening SSH", async () => {
    const secret = await token(["resources:read"]);
    const get = (q = "") => run(usageHistoryRoute, req(`/servers/${myServerId}/usage/history${q}`, { secret }), { serverId: myServerId });
    const out = await (await get()).json();
    expect(out).toMatchObject({ serverId: myServerId, hours: 24, sampled: false });
    expect(out.points).toHaveLength(4);
    expect(out.points[0]).toMatchObject({ cpu: 0.25, mem: 0.25, disk: 0.1 });
    expect(out.points.map((p: { at: string }) => p.at)).toEqual([...out.points.map((p: { at: string }) => p.at)].sort());
    expect((await (await get("?hours=1")).json()).points.length).toBeGreaterThan(0);
    for (const bad of ["?hours=0", "?hours=169", "?hours=x"]) expect((await get(bad)).status, bad).toBe(400);
    expect(sshWasUsed()).toBe(false);
  });

  it("thins a long history to a readable size by averaging", async () => {
    const secret = await token(["resources:read"]);
    const server = (await createServer(me.id, "sam-big")).id;
    const now = Date.now();
    await ctx.db.insert(schema.usageSamples).values(
      Array.from({ length: 1200 }, (_, i) => ({ serverId: server, at: new Date(now - i * 60_000), cpuLoad: 1, cpus: 2, memUsedMb: 100, memTotalMb: 1000, diskUsedMb: null, diskTotalMb: null }))
    );
    const out = await (await run(usageHistoryRoute, req(`/servers/${server}/usage/history?hours=24`, { secret }), { serverId: server })).json();
    expect(out.sampled).toBe(true);
    expect(out.points.length).toBeLessThanOrEqual(500);
    expect(out.points[0].cpu).toBeCloseTo(0.5);
    expect(out.points[0].mem).toBeCloseTo(0.1);
    expect(out.points[0].disk).toBeNull();
  });

  it("returns a project's memory and CPU with now and peak", async () => {
    const out = (await (await run(projectResourcesRoute, req(`/projects/${projectId}/resources`, { secret: await token(["resources:read"]) }), { projectId })).json()).resources;
    expect(out).toMatchObject({ id: projectId, slug: "app", memPeakMb: 102, cpuPeakPercent: 7, restarts: 1 });
    expect(out.points).toHaveLength(3);
    expect(typeof out.points[0].at).toBe("string");
  });
});

// ---------------------------------------------------------- servers, inventory

describe("servers and the container inventory", () => {
  it("lists servers without key material or error text", async () => {
    const { servers } = await (await run(listServersRoute, req("/servers", { secret: await token(["container:read"]) }))).json();
    expect(servers.map((s: { id: string }) => s.id)).toContain(myServerId);
    expect(servers.map((s: { id: string }) => s.id)).not.toContain(theirServerId);
    expect(Object.keys(servers[0]).sort()).toEqual(["createdAt", "host", "id", "lastCheckedAt", "nestUsername", "status"]);
  });

  it("reads the container read-only, sets it against the projects, and leaves out command lines and paths", async () => {
    const secret = await token(["container:read"]);
    scriptReply = () => ({ code: 0, stdout: INVENTORY });
    const res = await run(inventoryRoute, req(`/servers/${myServerId}/inventory`, { secret }), { serverId: myServerId });
    expect(res.status).toBe(200);
    const { inventory } = await res.json();
    expect(inventory).toMatchObject({ serverId: myServerId, disk: { totalMb: 10240, usedMb: 4096 } });
    expect(inventory.projects.find((p: { slug: string }) => p.slug === "app")).toMatchObject({ serviceState: "running", folderKb: 2048 });
    expect(inventory.leftovers.map((l: { slug: string; kind: string }) => `${l.slug}:${l.kind}`).sort()).toEqual(["ghost:folder", "ghost:service"]);
    const text = JSON.stringify(inventory);
    expect(text).not.toContain(EXEC_SECRET);
    expect(text).not.toContain("/etc/systemd");
    expect(text).not.toContain("execStart");
    // One read-only script, nothing that writes or removes.
    expect(session.script).toHaveBeenCalledTimes(1);
    expect(String(session.script.mock.calls[0][0])).not.toMatch(/\brm\b|systemctl (stop|disable|restart)/);
  });

  it("turns an unreachable container into a plain error without its output", async () => {
    const secret = await token(["container:read"]);
    scriptReply = () => ({ code: 0, stdout: "garbage /home/sam/secret" });
    const res = await run(inventoryRoute, req(`/servers/${myServerId}/inventory`, { secret }), { serverId: myServerId });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("/home/sam/secret");
  });
});

// ---------------------------------------------------------------------- activity

describe("the activity log", () => {
  it("returns the caller's entries newest first with readable labels, and says which came from a token", async () => {
    const t = await mint(["activity:read", "env:write"]);
    await run(setEnvRoute, req(`/projects/${projectId}/env/FROM_AGENT`, { secret: t.secret, method: "PUT", body: { value: "v" } }), { projectId, key: "FROM_AGENT" });
    const res = await run(activityRoute, req("/activity?limit=5", { secret: t.secret }));
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.items.length).toBeLessThanOrEqual(5);
    const first = page.items[0];
    expect(first).toMatchObject({ action: "env.set", label: "Saved environment variable on", kind: "projects", target: { name: "App", gone: false }, viaToken: { name: "t" } });
    expect(first.fields).toEqual(expect.arrayContaining([{ label: "Variable", value: "FROM_AGENT" }]));
    expect(page.total).toBeGreaterThan(5);
    expect(page.nextCursor).toMatch(/^\d+\.\d+$/);
    const times = page.items.map((i: { at: string }) => i.at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("pages with the cursor and filters by kind and range", async () => {
    const secret = await token(["activity:read"]);
    const get = async (q: string) => (await run(activityRoute, req(`/activity${q}`, { secret }))).json();
    const a = await get("?limit=2");
    const b = await get(`?limit=2&cursor=${a.nextCursor}`);
    expect(b.items.map((i: { id: number }) => i.id)).not.toEqual(expect.arrayContaining([a.items[0].id]));
    expect(b.items[0].id).toBeLessThan(a.items[1].id);
    const projectsOnly = await get("?kind=projects&limit=100");
    expect(projectsOnly.items.every((i: { kind: string }) => i.kind === "projects")).toBe(true);
    const day = await get("?range=24h&limit=100");
    expect(day.items.length).toBeGreaterThan(0);
    for (const bad of ["?kind=everything", "?range=forever", "?limit=0", "?limit=101", "?cursor=abc", "?cursor=1.2.3"]) {
      expect((await run(activityRoute, req(`/activity${bad}`, { secret }))).status, bad).toBe(400);
    }
  });

  it("never shows another user's activity", async () => {
    const secret = await token(["activity:read"]);
    const otherToken = await mint(["activity:read"], other.id);
    await ctx.db.insert(schema.auditLog).values({ userId: other.id, action: "project.update", target: theirProjectId, meta: JSON.stringify({ fields: "port" }), at: new Date() });
    const mineOnly = await (await run(activityRoute, req("/activity?limit=100", { secret }))).json();
    expect(mineOnly.items.some((i: { target: { name: string } | null }) => i.target?.name === "Theirs")).toBe(false);
    const theirs = await (await run(activityRoute, req("/activity?limit=100", { secret: otherToken.secret }))).json();
    expect(theirs.items.some((i: { target: { name: string } | null }) => i.target?.name === "Theirs")).toBe(true);
    expect(theirs.items.some((i: { target: { name: string } | null }) => i.target?.name === "App")).toBe(false);
  });

  it("hides anything that looks like a secret in an entry's details", async () => {
    const secret = await token(["activity:read"]);
    await ctx.db.insert(schema.auditLog).values({
      userId: me.id,
      action: "project.update",
      target: projectId,
      meta: JSON.stringify({ fields: "port", webhookUrl: PLANTED_URL, apiToken: "ndp_" + "a".repeat(40), note: PLANTED_URL, password: "hunter2" }),
      at: new Date(),
    });
    const text = await (await run(activityRoute, req("/activity?limit=5", { secret }))).text();
    for (const leak of ["PLANTEDWEBHOOKSECRET", "ndp_aaaa", "hunter2"]) expect(text).not.toContain(leak);
  });
});

// ------------------------------------------------------------------ rate limits

describe("rate limits", () => {
  it("gives the SSH-style endpoints their own small bucket of 10 a minute, separate from reads and writes", async () => {
    const secret = await token(["resources:read", "env:read", "env:write"]);
    const call = () => run(usageHistoryRoute, req(`/servers/${myServerId}/usage/history`, { secret }), { serverId: myServerId });
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200);
    const blocked = await call();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await errorOf(blocked)).code).toBe("rate_limited");
    // Reads and writes are not affected.
    expect((await run(listEnvRoute, req(`/projects/${projectId}/env`, { secret }), { projectId })).status).toBe(200);
    expect((await run(listServersRoute, req("/servers", { secret: await token() }))).status).toBe(200);
  });

  it("shares the 120 a minute read bucket and the 30 a minute change bucket across the new endpoints", async () => {
    const reader = await token(["env:read", "projects:read"]);
    for (let i = 0; i < 60; i++) await run(listEnvRoute, req(`/projects/${projectId}/env`, { secret: reader }), { projectId });
    for (let i = 0; i < 60; i++) await run(statusPageRoute, req(`/projects/${projectId}/status-page`, { secret: reader }), { projectId });
    expect((await run(listEnvRoute, req(`/projects/${projectId}/env`, { secret: reader }), { projectId })).status).toBe(429);

    const writer = await token(["env:write"]);
    for (let i = 0; i < 30; i++) {
      expect((await run(setEnvRoute, req(`/projects/${projectId}/env/RATE_${i % 3}`, { secret: writer, method: "PUT", body: { value: "v" } }), { projectId, key: `RATE_${i % 3}` })).status).toBe(200);
    }
    const res = await run(deleteEnvRoute, req(`/projects/${projectId}/env/RATE_0`, { secret: writer, method: "DELETE" }), { projectId, key: "RATE_0" });
    expect(res.status).toBe(429);
  });
});

// ------------------------------------------------------------------- secrets

describe("secrets", () => {
  it("never appears in any response of any new endpoint", () => {
    expect(bodies.length).toBeGreaterThan(100);
    const secrets = [ENV_SECRET, NOTIFY_URL, NOTIFY_SECRET, EXEC_SECRET, "their-secret-value", ...issued, ...hookUrlsSeen.map((u) => u.split("/").pop() as string)];
    for (const body of bodies) {
      for (const secret of secrets) expect(body.includes(secret), `a response contained ${secret.slice(0, 12)}...`).toBe(false);
    }
  });

  it("never appears in the audit log", async () => {
    const rows = JSON.stringify(await ctx.db.select().from(schema.auditLog));
    for (const secret of [ENV_SECRET, NOTIFY_URL, NOTIFY_SECRET, ...issued, ...hookUrlsSeen.map((u) => u.split("/").pop() as string)]) {
      expect(rows.includes(secret)).toBe(false);
    }
  });
});
