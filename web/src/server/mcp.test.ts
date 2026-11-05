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
        "add_domain",
        "cancel_deployment",
        "create_project",
        "delete_env_var",
        "delete_file",
        "delete_project",
        "deploy_branch",
        "download_file",
        "get_activity",
        "get_alerts",
        "get_analytics",
        "get_container_inventory",
        "get_deployment",
        "get_deployment_logs",
        "get_logs",
        "get_notifications",
        "get_project",
        "get_project_resources",
        "get_resource_history",
        "get_server_usage",
        "get_status_page",
        "list_deployments",
        "list_domains",
        "list_env_vars",
        "list_files",
        "list_projects",
        "list_servers",
        "make_folder",
        "read_file",
        "redeploy",
        "remove_domain",
        "rename_file",
        "revoke_deploy_hook",
        "rollback_deployment",
        "rotate_deploy_hook",
        "set_env_var",
        "terminal_close",
        "terminal_open",
        "terminal_read",
        "terminal_resize",
        "terminal_send",
        "terminal_status",
        "test_notification",
        "update_project",
        "verify_domain",
        "write_file",
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
      // Every tool is called with one token here; the scope check is what is being tested, not the rate limit.
      rateLimiter().clear();
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

describe("the expanded tool list", () => {
  type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; annotations: { readOnlyHint: boolean; destructiveHint: boolean } };
  const listTools = async () => ((await (await send(rpc("tools/list"), await token())).json()).result.tools as Tool[]);
  const byName = async () => new Map((await listTools()).map((t) => [t.name, t]));

  it("has one tool per endpoint with the names an agent would expect", async () => {
    const tools = await byName();
    for (const name of [
      "create_project", "update_project", "delete_project", "set_env_var", "delete_env_var", "list_env_vars", "add_domain",
      "verify_domain", "remove_domain", "get_deployment", "get_deployment_logs", "get_activity", "get_analytics",
      "get_resource_history", "get_project_resources", "list_servers", "get_container_inventory", "rotate_deploy_hook",
      "revoke_deploy_hook", "get_notifications", "test_notification", "get_alerts", "get_status_page",
      "terminal_open", "terminal_send", "terminal_read", "terminal_close", "list_files", "read_file", "write_file",
      "make_folder", "delete_file",
    ]) {
      expect(tools.has(name), name).toBe(true);
    }
    expect([...tools.keys()].sort()).toEqual(ENDPOINTS.map((e) => e.id).sort());
    expect(TOOLS).toHaveLength(ENDPOINTS.length);
  });

  it("marks every tool that deletes or can run commands or change files as destructive, and only writes", async () => {
    const tools = await byName();
    for (const name of [
      "delete_project", "delete_env_var", "remove_domain", "rotate_deploy_hook", "revoke_deploy_hook", "cancel_deployment",
      "rollback_deployment", "terminal_open", "terminal_send", "terminal_close", "write_file", "make_folder", "rename_file", "delete_file",
    ]) {
      expect(tools.get(name)!.annotations, name).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    for (const [name, tool] of tools) {
      if (tool.annotations.readOnlyHint) expect(tool.annotations.destructiveHint, name).toBe(false);
    }
    for (const name of ["list_env_vars", "get_activity", "list_files", "read_file", "terminal_read", "get_container_inventory", "list_servers"]) {
      expect(tools.get(name)!.annotations.readOnlyHint, name).toBe(true);
    }
  });

  it("says in the descriptions that terminal commands run for real and that output is untrusted, and names the needed scope", async () => {
    const tools = await byName();
    for (const name of ["terminal_open", "terminal_send"]) {
      expect(tools.get(name)!.description, name).toMatch(/run for real/);
    }
    for (const name of ["terminal_open", "terminal_send", "terminal_read", "read_file", "get_deployment_logs", "get_logs"]) {
      expect(tools.get(name)!.description, name).toMatch(/untrusted/i);
    }
    for (const name of ["write_file", "delete_file", "make_folder"]) expect(tools.get(name)!.description, name).toMatch(/shared\//);
    for (const ep of ENDPOINTS) expect(tools.get(ep.id)!.description).toContain(`Needs the ${ep.scope} scope.`);
    for (const name of ["set_env_var", "rotate_deploy_hook"]) expect(tools.get(name)!.description).toMatch(/secret|write-only/i);
    expect(tools.get("rotate_deploy_hook")!.description).toMatch(/ONCE/);
  });

  it("has strict input schemas that name required fields", async () => {
    const tools = await byName();
    for (const t of tools.values()) expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(tools.get("set_env_var")!.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "key", "value"]));
    expect(tools.get("terminal_send")!.inputSchema.required).toEqual(expect.arrayContaining(["projectId", "sessionId", "data"]));
    expect(tools.get("create_project")!.inputSchema.required).toEqual(expect.arrayContaining(["serverId", "name", "repoUrl", "runtime", "port"]));
  });
});

describe("expanded tools/call", () => {
  it("gates each new tool by scope, before any work", async () => {
    const calls: [string, Scope, Record<string, unknown>][] = [
      ["create_project", "projects:write", { serverId, name: "X", repoUrl: "https://github.com/a/b.git", runtime: "node", port: 3999 }],
      ["update_project", "projects:write", { projectId, healthPath: "/x" }],
      ["delete_project", "projects:write", { projectId }],
      ["list_env_vars", "env:read", { projectId }],
      ["set_env_var", "env:write", { projectId, key: "A", value: "b" }],
      ["delete_env_var", "env:write", { projectId, key: "A" }],
      ["add_domain", "domains:write", { serverId, domain: "a.example.com", port: 3000 }],
      ["verify_domain", "domains:write", { domainId: "x" }],
      ["remove_domain", "domains:write", { domainId: "x" }],
      ["rotate_deploy_hook", "deployments:write", { projectId }],
      ["get_notifications", "notifications:read", { projectId }],
      ["get_alerts", "alerts:read", { projectId }],
      ["get_analytics", "analytics:read", { projectId }],
      ["get_project_resources", "resources:read", { projectId }],
      ["list_servers", "container:read", {}],
      ["get_container_inventory", "container:read", { serverId }],
      ["get_activity", "activity:read", {}],
      ["terminal_open", "terminal:use", { projectId }],
      ["list_files", "files:read", { projectId }],
      ["write_file", "files:write", { projectId, path: "shared/a", content: "x" }],
      ["delete_file", "files:write", { projectId, path: "shared/a" }],
    ];
    const before = (await ctx.db.select().from(schema.projects)).length;
    for (const [name, scope, args] of calls) {
      const secret = await token(ALL.filter((s) => s !== scope));
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, name).toBe(true);
      expect(text(body), name).toContain(scope);
    }
    expect((await ctx.db.select().from(schema.projects)).length).toBe(before);
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("returns ownership failures for the new tools as not_found tool errors", async () => {
    const secret = await token();
    for (const [name, args] of [
      ["update_project", { projectId: theirProjectId, healthPath: "/x" }],
      ["delete_project", { projectId: theirProjectId }],
      ["list_env_vars", { projectId: theirProjectId }],
      ["set_env_var", { projectId: theirProjectId, key: "A", value: "b" }],
      ["get_deployment", { deploymentId: theirDeploymentId }],
      ["get_deployment_logs", { deploymentId: theirDeploymentId }],
      ["rotate_deploy_hook", { projectId: theirProjectId }],
      ["get_alerts", { projectId: theirProjectId }],
      ["get_analytics", { projectId: theirProjectId }],
      ["get_status_page", { projectId: theirProjectId }],
      ["get_container_inventory", { serverId: "not-mine" }],
      ["get_resource_history", { serverId: "not-mine" }],
      ["terminal_open", { projectId: theirProjectId }],
      ["list_files", { projectId: theirProjectId }],
      ["write_file", { projectId: theirProjectId, path: "shared/a", content: "x" }],
    ] as const) {
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, name).toBe(true);
      expect(text(body), name).toMatch(/^not_found:/);
    }
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("sets an environment variable and never returns the value, in any tool", async () => {
    const t = await createApiToken(me.id, { name: "mcp-env", scopes: ["env:write", "env:read", "projects:read"] });
    const value = "mcp-secret-value-91ab";
    const set = await (await call(t.secret, "set_env_var", { projectId, key: "MCP_KEY", value, target: "production" })).json();
    expect(set.result.isError).toBe(false);
    expect(JSON.parse(text(set))).toEqual({ env: { key: "MCP_KEY", target: "production" } });
    const list = await (await call(t.secret, "list_env_vars", { projectId })).json();
    expect(JSON.parse(text(list)).env).toContainEqual({ key: "MCP_KEY", target: "production" });
    expect(JSON.stringify([set, list])).not.toContain(value);
    // A rejected value is not echoed back in the error.
    const bad = await (await call(t.secret, "set_env_var", { projectId, key: "1BAD", value })).json();
    expect(bad.result.isError).toBe(true);
    expect(text(bad)).not.toContain(value);
    const rows = (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, me.id))).filter((r) => r.action === "env.set");
    expect(rows.some((r) => JSON.parse(r.meta!).token === t.token.id && JSON.parse(r.meta!).via === "api")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(value);
  });

  it("returns the deploy hook URL once, from the rotate tool only", async () => {
    const secret = await token(["deployments:write", "projects:read", "notifications:read", "alerts:read"]);
    const rotated = await (await call(secret, "rotate_deploy_hook", { projectId })).json();
    const { hook } = JSON.parse(text(rotated));
    expect(hook.url).toMatch(/\/api\/hooks\/deploy\/ndh_/);
    const hookToken = hook.url.split("/").pop();
    for (const [name, args] of [["get_project", { projectId }], ["list_projects", {}], ["get_notifications", { projectId }], ["get_alerts", { projectId }]] as const) {
      expect(JSON.stringify(await (await call(secret, name, args)).json()), name).not.toContain(hookToken);
    }
    await call(secret, "revoke_deploy_hook", { projectId });
  });

  it("refuses the terminal and file changes with disabled until the owner turns the switch on, before any SSH", async () => {
    const secret = await token();
    for (const [name, args] of [
      ["terminal_open", { projectId }],
      ["terminal_send", { projectId, sessionId: "A".repeat(22), data: "ls\n" }],
      ["write_file", { projectId, path: "shared/a.txt", content: "x" }],
      ["make_folder", { projectId, path: "shared/d" }],
      ["delete_file", { projectId, path: "shared/a.txt" }],
    ] as const) {
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, name).toBe(true);
      expect(text(body), name).toMatch(/^disabled:/);
    }
    expect(vi.mocked(withServerSession)).not.toHaveBeenCalled();
  });

  it("returns bad arguments for the new tools as validation errors", async () => {
    const secret = await token();
    for (const [name, args] of [
      ["create_project", { serverId, name: "X", repoUrl: "https://github.com/a/b.git", runtime: "node", port: 22 }],
      ["update_project", { projectId }],
      ["delete_project", { projectId, removeFromServer: "maybe" }],
      ["get_analytics", { projectId, days: 91 }],
      ["get_resource_history", { serverId, hours: 0 }],
      ["get_activity", { kind: "everything" }],
      ["get_activity", { cursor: "abc" }],
      ["terminal_open", { projectId, cols: 5 }],
      ["write_file", { projectId, path: "shared/a", content: "x", mode: "777" }],
    ] as const) {
      const body = await (await call(secret, name, args)).json();
      expect(body.result.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(text(body)).toMatch(/^validation:/);
    }
  });

  it("gives the SSH-using tools their own bucket of 10 a minute", async () => {
    const secret = await token();
    session.script.mockResolvedValue({ code: 0, stdout: "garbage", stderr: "" });
    for (let i = 0; i < 10; i++) {
      const res = await call(secret, "get_container_inventory", { serverId });
      expect(res.status).toBe(200);
    }
    const res = await call(secret, "get_container_inventory", { serverId });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await send(rpc("tools/list"), secret)).status).toBe(200);
    expect((await call(secret, "list_servers")).status).toBe(200);
  });
});

describe("what tokens can never reach", () => {
  const EXCLUDED = /orphan|permission|account|session|token|leftover|rotate_key|rotate-key/;
  // Terminal session ids (/terminal/{sessionId}) are not browser sessions.
  const strip = (s: string) => s.replace(/\{sessionId\}|sessionId/g, "");

  it("is absent from the endpoints, the OpenAPI document and the MCP tools", async () => {
    const { buildOpenApi } = await import("@/server/api-v1-openapi");
    const doc = buildOpenApi() as { paths: Record<string, Record<string, { operationId: string }>> };

    const endpointText = ENDPOINTS.map((e) => strip(`${e.id} ${e.path}`));
    const toolNames = TOOLS.map((t) => t.name);
    const operations = Object.entries(doc.paths).flatMap(([path, ops]) => Object.values(ops).map((o) => strip(`${o.operationId} ${path}`)));
    for (const list of [endpointText, toolNames, operations]) {
      for (const entry of list) expect(entry, entry).not.toMatch(EXCLUDED);
    }
    expect(ENDPOINTS.filter((e) => e.path.startsWith("/servers") && !e.readOnly)).toEqual([]);
    for (const gone of ["remove_orphan", "remove_leftover", "set_permissions", "create_token", "revoke_token", "delete_account", "revoke_session"]) {
      expect(toolNames).not.toContain(gone);
    }
  });

  it("includes the terminal and file paths, each gated by its own scope", async () => {
    const { buildOpenApi } = await import("@/server/api-v1-openapi");
    const doc = buildOpenApi() as { paths: Record<string, Record<string, { operationId: string; security: { bearerAuth: string[] }[] }>> };
    const expected: Record<string, string> = {
      terminal_status: "terminal:use", terminal_open: "terminal:use", terminal_send: "terminal:use", terminal_read: "terminal:use",
      terminal_resize: "terminal:use", terminal_close: "terminal:use",
      list_files: "files:read", read_file: "files:read", download_file: "files:read",
      write_file: "files:write", make_folder: "files:write", rename_file: "files:write", delete_file: "files:write",
    };
    const ops = Object.values(doc.paths).flatMap((o) => Object.values(o));
    for (const [id, scope] of Object.entries(expected)) {
      const op = ops.find((o) => o.operationId === id);
      expect(op, id).toBeDefined();
      expect(op!.security, id).toEqual([{ bearerAuth: [scope] }]);
      expect(TOOLS.some((t) => t.name === id), id).toBe(true);
      expect(ENDPOINTS.find((e) => e.id === id)!.scope).toBe(scope);
    }
  });
});
