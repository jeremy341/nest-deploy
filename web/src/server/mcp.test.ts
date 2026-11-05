import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createApiToken, SCOPES, type Scope } from "@/server/api-tokens";
import { ENDPOINTS } from "@/server/api-v1";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { TOOLS } from "@/server/mcp";
import { createProject, deployBranch } from "@/server/projects";
import { rateLimiter } from "@/server/rate-limit";
import { useFreshDb } from "@/server/test/db";

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
import { DELETE, GET, POST } from "@/app/api/mcp/route";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string };
let other: { id: string };
let projectId: string;
let theirProjectId: string;
let theirDeploymentId: string;
let serverId: string;

const session = { script: vi.fn() };
const ALL: Scope[] = [...SCOPES];
const token = async (scopes: Scope[] = ALL) => (await createApiToken(me.id, { name: "mcp", scopes })).secret;

const send = (body: unknown, secret?: string | null, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    undefined
  );
const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, params });
const call = (secret: string, name: string, args?: unknown) => send(rpc("tools/call", { name, arguments: args }), secret);
const text = (body: { result: { content: { text: string }[] } }) => body.result.content[0].text;

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "m1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "m2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  serverId = (await createServer(me.id, "sam-mcp")).id;
  const theirServer = (await createServer(other.id, "kim-mcp")).id;
  projectId = (await createProject(me.id, { ...base, serverId, name: "App", slug: "app", port: 3000 })).id;
  theirProjectId = (await createProject(other.id, { ...base, serverId: theirServer, name: "Theirs", slug: "theirs", port: 3001 })).id;
  theirDeploymentId = (await deployBranch(other.id, theirProjectId)).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

beforeEach(async () => {
  await ctx.db.delete(schema.apiTokens);
  rateLimiter().clear();
  session.script.mockReset();
  session.script.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  vi.mocked(withServerSession).mockReset();
  vi.mocked(withServerSession).mockImplementation(async (_s, fn) => fn(session as never));
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: me.id, name: "Sam" } as never);
});

describe("authentication", () => {
  it("answers 401 with WWW-Authenticate: Bearer without a token, with a bad one, and with only a cookie", async () => {
    for (const res of [
      await send(rpc("tools/list")),
      await send(rpc("tools/list"), "ndp_unknown"),
      await send(rpc("tools/list"), "sk_wrong_prefix"),
      await send(rpc("tools/list"), null, { cookie: "nd_session=abc" }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect((await res.json()).error.code).toBe("unauthorized");
    }
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("checks the token before reading the body", async () => {
    const res = await send("{{{ not json", null);
    expect(res.status).toBe(401);
  });

  it("refuses GET and DELETE: there is no stream and no session", async () => {
    const secret = await token();
    for (const m of [GET, DELETE]) {
      const res = await m(new NextRequest("http://localhost:3000/api/mcp", { headers: { authorization: `Bearer ${secret}` } }), undefined);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});

describe("protocol", () => {
  it("initializes and negotiates the protocol version", async () => {
    const secret = await token();
    const res = await send(rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }), secret);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "nest-deploy" } },
    });
    const newer = await (await send(rpc("initialize", { protocolVersion: "2099-01-01" }), secret)).json();
    expect(newer.result.protocolVersion).toBe("2025-06-18");
  });

  it("answers a notification with 202 and no body", async () => {
    const secret = await token();
    const res = await send({ jsonrpc: "2.0", method: "notifications/initialized" }, secret);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("lists one tool per endpoint, with a schema and a description", async () => {
    const secret = await token();
    const body = await (await send(rpc("tools/list"), secret)).json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual(
      [
        "cancel_deployment",
        "deploy_branch",
        "get_logs",
        "get_project",
        "get_server_usage",
        "list_deployments",
        "list_domains",
        "list_projects",
        "redeploy",
        "rollback_deployment",
      ].sort()
    );
    expect(names.sort()).toEqual(ENDPOINTS.map((e) => e.id).sort());
    for (const t of body.result.tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(t.inputSchema).not.toHaveProperty("$schema");
    }
    const deploy = body.result.tools.find((t: { name: string }) => t.name === "deploy_branch");
    expect(deploy.inputSchema.required).toEqual(["projectId"]);
    expect(deploy.inputSchema.properties.branch.type).toBe("string");
    const deps = body.result.tools.find((t: { name: string }) => t.name === "list_deployments");
    expect(deps.inputSchema.properties.limit).toMatchObject({ type: "integer", minimum: 1, maximum: 100, default: 20 });
    expect(TOOLS).toHaveLength(ENDPOINTS.length);
  });

  it("answers an unknown method with -32601", async () => {
    const secret = await token();
    const body = await (await send(rpc("resources/list"), secret)).json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32601 } });
  });

  it("answers broken JSON with -32700 and a non-message with -32600", async () => {
    const secret = await token();
    const bad = await send("{{{", secret);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);
    for (const body of [[], { id: 1 }, { jsonrpc: "1.0", id: 1, method: "ping" }, "5"]) {
      const res = await send(body, secret);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(-32600);
    }
  });

  it("answers ping", async () => {
    const body = await (await send(rpc("ping"), await token())).json();
    expect(body.result).toEqual({});
  });
});

describe("tools/call", () => {
  it("runs list_projects through the same service as the REST API", async () => {
    const res = await call(await token(), "list_projects");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(false);
    const data = JSON.parse(text(body));
    expect(data.projects.map((p: { id: string }) => p.id)).toEqual([projectId]);
  });

  it("deploys through deploy_branch and audits it", async () => {
    const secret = await token();
    const body = await (await call(secret, "deploy_branch", { projectId, branch: "feature/x" })).json();
    expect(body.result.isError).toBe(false);
    expect(JSON.parse(text(body)).deployment).toMatchObject({ env: "preview", branch: "feature/x", state: "queued" });
    const rows = (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, me.id))).filter((r) => r.action === "deploy.trigger");
    expect(rows.some((r) => JSON.parse(r.meta!).branch === "feature/x")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(secret);
  });

  it("reads logs and usage", async () => {
    const secret = await token();
    session.script.mockResolvedValue({ code: 0, stdout: "hello\nworld\n", stderr: "" });
    const logs = JSON.parse(text(await (await call(secret, "get_logs", { projectId, lines: 1 })).json()));
    expect(logs.lines).toEqual(["world"]);
    session.script.mockResolvedValue({ code: 0, stdout: "cpus=2\nload1=0.25\n", stderr: "" });
    const u = JSON.parse(text(await (await call(secret, "get_server_usage", { serverId })).json()));
    expect(u.usage).toMatchObject({ serverId, cpus: 2, cpuLoad: 0.25 });
  });

  it("answers an unknown tool with a JSON-RPC invalid-params error, not a crash", async () => {
    const res = await call(await token(), "delete_everything", {});
    expect(res.status).toBe(200);
    expect((await res.json()).error).toMatchObject({ code: -32602 });
    for (const params of [undefined, {}, { name: 5 }, { name: "list_projects", arguments: "x" }, { name: "list_projects", arguments: [] }]) {
      const r = await send(rpc("tools/call", params), await token());
      expect((await r.json()).error.code).toBe(-32602);
    }
  });

  it("returns a missing scope as a tool error that names it", async () => {
    const secret = await token(["projects:read"]);
    for (const ep of ENDPOINTS.filter((e) => e.scope !== "projects:read")) {
      const body = await (await call(secret, ep.id, { projectId, deploymentId: theirDeploymentId, serverId })).json();
      expect(body.result.isError, ep.id).toBe(true);
      expect(text(body), ep.id).toContain(ep.scope);
    }
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("returns ownership failures as tool errors", async () => {
    const secret = await token();
    for (const [name, args] of [
      ["get_project", { projectId: theirProjectId }],
      ["list_deployments", { projectId: theirProjectId }],
      ["deploy_branch", { projectId: theirProjectId }],
      ["get_logs", { projectId: theirProjectId }],
      ["redeploy", { deploymentId: theirDeploymentId }],
      ["cancel_deployment", { deploymentId: theirDeploymentId }],
      ["rollback_deployment", { deploymentId: theirDeploymentId }],
    ] as const) {
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, name).toBe(true);
      expect(text(body), name).toMatch(/^not_found:/);
    }
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("returns bad arguments as tool errors, including unknown ones", async () => {
    const secret = await token();
    for (const [name, args] of [
      ["get_project", {}],
      ["get_project", { projectId: 5 }],
      ["get_project", { projectId, extra: 1 }],
      ["list_deployments", { projectId, limit: 0 }],
      ["list_deployments", { projectId, limit: 101 }],
      ["deploy_branch", { projectId, branch: "--upload-pack=x" }],
      ["deploy_branch", { projectId, brach: "main" }],
      ["get_logs", { projectId, lines: 5000 }],
    ] as const) {
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(text(body)).toMatch(/^validation:/);
    }
  });

  it("turns a container failure into a tool error without leaking its output", async () => {
    session.script.mockResolvedValue({ code: 9, stdout: "", stderr: "/home/sam/secret: boom" });
    const body = await (await call(await token(), "get_logs", { projectId })).json();
    expect(body.result.isError).toBe(true);
    expect(text(body)).not.toContain("boom");
  });

  it("turns an unexpected failure into a generic tool error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(withServerSession).mockRejectedValue(new Error("secret internal detail"));
    const body = await (await call(await token(), "get_logs", { projectId })).json();
    expect(body.result.isError).toBe(true);
    expect(text(body)).toBe("internal: Something went wrong on our side.");
    spy.mockRestore();
  });

  it("rate-limits per token with 429 and Retry-After, writes tighter than reads", async () => {
    const secret = await token();
    for (let i = 0; i < 120; i++) expect((await send(rpc("tools/list"), secret)).status).toBe(200);
    const blocked = await send(rpc("tools/list"), secret);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);

    const writer = await token();
    for (let i = 0; i < 30; i++) {
      const body = await (await call(writer, "deploy_branch", { projectId })).json();
      expect(body.result.isError).toBe(false);
    }
    const res = await call(writer, "deploy_branch", { projectId });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await send(rpc("tools/list"), writer)).status).toBe(200);
  });
});
