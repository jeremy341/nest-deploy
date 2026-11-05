import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiToken, SCOPES, type Scope } from "@/server/api-tokens";
import { ENDPOINTS } from "@/server/api-v1";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { setPermissions } from "@/server/permissions";
import { createProject } from "@/server/projects";
import { rateLimiter } from "@/server/rate-limit";
import { useFreshDb } from "@/server/test/db";
import type { ShellCloseReason, ShellHandle } from "@/server/ssh/shell";
import { completeUtf8, TERMINAL_LIMITS, terminals, TerminalManager } from "@/server/terminal";

// Routes, services, permissions, ownership and the audit log are real. The SSH session is a
// scripted one, and the shell behind a terminal is a fake that records what it is given.
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
import { GET as terminalStatusRoute, POST as terminalOpenRoute } from "@/app/api/v1/projects/[projectId]/terminal/route";
import { DELETE as terminalCloseRoute } from "@/app/api/v1/projects/[projectId]/terminal/[sessionId]/route";
import { POST as terminalSendRoute } from "@/app/api/v1/projects/[projectId]/terminal/[sessionId]/input/route";
import { GET as terminalReadRoute } from "@/app/api/v1/projects/[projectId]/terminal/[sessionId]/output/route";
import { POST as terminalResizeRoute } from "@/app/api/v1/projects/[projectId]/terminal/[sessionId]/resize/route";
import { DELETE as deleteFileRoute, GET as listFilesRoute } from "@/app/api/v1/projects/[projectId]/files/route";
import { GET as readFileRoute, PUT as writeFileRoute } from "@/app/api/v1/projects/[projectId]/files/content/route";
import { GET as downloadFileRoute } from "@/app/api/v1/projects/[projectId]/files/download/route";
import { POST as makeFolderRoute } from "@/app/api/v1/projects/[projectId]/files/folders/route";
import { POST as renameFileRoute } from "@/app/api/v1/projects/[projectId]/files/rename/route";

class FakeShell implements ShellHandle {
  written: string[] = [];
  sizes: { cols: number; rows: number }[] = [];
  closed = 0;
  private data: ((c: Buffer) => void) | null = null;
  private close_: ((r: ShellCloseReason) => void) | null = null;
  write(d: string) {
    this.written.push(d);
  }
  resize(cols: number, rows: number) {
    this.sizes.push({ cols, rows });
  }
  onData(cb: (c: Buffer) => void) {
    this.data = cb;
  }
  onClose(cb: (r: ShellCloseReason) => void) {
    this.close_ = cb;
  }
  close() {
    this.closed += 1;
  }
  emit(text: string | Buffer) {
    this.data?.(typeof text === "string" ? Buffer.from(text) : text);
  }
  drop(reason: ShellCloseReason) {
    this.close_?.(reason);
  }
}

const MANAGER_KEY = Symbol.for("nest-deploy.terminal-manager");
let shells: FakeShell[] = [];
let connects = 0;
function freshManager() {
  (globalThis as unknown as Record<symbol, unknown>)[MANAGER_KEY] = new TerminalManager({
    connect: async () => {
      connects += 1;
      const shell = new FakeShell();
      shells.push(shell);
      return { shell, uid: 0, host: "sam.hackclub.app" };
    },
  });
  return terminals();
}

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string };
let other: { id: string };
let myServerId: string;
let projectId: string;
let theirProjectId: string;

type Handler = (req: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
const issued: string[] = [];
const mint = async (scopes: Scope[], userId = me.id) => {
  const made = await createApiToken(userId, { name: "agent", scopes, expiresInDays: 7 });
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
const run = (h: Handler, request: NextRequest, params: Record<string, string> = {}) => h(request, { params: Promise.resolve(params) });
const errorOf = async (res: Response) => {
  const body = await res.json();
  return { status: res.status, code: body.error?.code as string, message: body.error?.message as string };
};
const sshWasUsed = () => vi.mocked(withServerSession).mock.calls.length > 0;

const session = { exec: vi.fn(), script: vi.fn() };
let execReply: (kind: string, command: string) => { code: number; stdout?: string; stderr?: string } = () => ({ code: 0, stdout: "" });

/** Which file script a command is, from text only that script has. */
function kindOf(command: string): string {
  if (command.includes('printf %s "$HOME"')) return "home";
  if (command.includes("-mindepth 1")) return "list";
  if (command.includes("cat > ")) return "write";
  if (command.includes("mkdir -m")) return "mkdir";
  if (command.includes("mv -- ")) return "rename";
  if (command.includes("rm -rf")) return "delete";
  if (command.includes("base64 < ")) return "download";
  if (command.includes("head -c")) return "read";
  return "unknown";
}
const execCalls = () =>
  session.exec.mock.calls.map(([command, opts]) => ({ command: String(command), kind: kindOf(String(command)), opts: opts as { stdin?: Buffer } | undefined }));
const remoteCalls = () => execCalls().filter((c) => c.kind !== "home");

const auditRows = async (action: string) =>
  (await ctx.db.select().from(schema.auditLog).where(and(eq(schema.auditLog.userId, me.id), eq(schema.auditLog.action, action)))).map((r) => ({
    ...r,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
  }));

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "s1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "s2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  myServerId = (await createServer(me.id, "sam-shell")).id;
  const theirServerId = (await createServer(other.id, "kim-shell")).id;
  projectId = (await createProject(me.id, { ...base, serverId: myServerId, name: "App", slug: "app", port: 3000 })).id;
  theirProjectId = (await createProject(other.id, { ...base, serverId: theirServerId, name: "Theirs", slug: "theirs", port: 3001 })).id;
});
afterAll(async () => {
  terminals().closeAll();
  await ctx.cleanup();
});

beforeEach(async () => {
  await ctx.db.delete(schema.apiTokens);
  rateLimiter().clear();
  shells = [];
  connects = 0;
  freshManager();
  await setPermissions(me.id, myServerId, { terminal: false, fileWrites: false });
  execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: "" });
  session.exec.mockReset();
  session.exec.mockImplementation(async (command: string) => {
    const r = execReply(kindOf(command), command);
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  });
  vi.mocked(withServerSession).mockReset();
  vi.mocked(withServerSession).mockImplementation(async (_s, fn) => fn(session as never));
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: me.id, name: "Sam" } as never);
});
afterEach(() => {
  terminals().closeAll();
});

const on = (perm: { terminal?: boolean; fileWrites?: boolean }) => setPermissions(me.id, myServerId, perm);

const openTerminal = async (secret: string, body: unknown = {}) => {
  const res = await run(terminalOpenRoute, req(`/projects/${projectId}/terminal`, { secret, method: "POST", body }), { projectId });
  return { res, json: res.status === 201 ? await res.clone().json() : null };
};
const sessionPath = (sessionId: string, tail = "") => `/projects/${projectId}/terminal/${sessionId}${tail}`;
const sendTo = (secret: string, sessionId: string, data: string) =>
  run(terminalSendRoute, req(sessionPath(sessionId, "/input"), { secret, method: "POST", body: { data } }), { projectId, sessionId });
const readFrom = async (secret: string, sessionId: string, since: number) =>
  (await run(terminalReadRoute, req(sessionPath(sessionId, `/output?since=${since}`), { secret }), { projectId, sessionId })).json();

// ---------------------------------------------------------------- the surface

type Spec = { handler: Handler; method: string; path: string; params: Record<string, string>; body?: unknown };
const FAKE_SESSION = "A".repeat(22);
const SPECS = (): Record<string, Spec> => ({
  terminal_status: { handler: terminalStatusRoute, method: "GET", path: `/projects/${projectId}/terminal`, params: { projectId } },
  terminal_open: { handler: terminalOpenRoute, method: "POST", path: `/projects/${projectId}/terminal`, params: { projectId }, body: {} },
  terminal_send: { handler: terminalSendRoute, method: "POST", path: sessionPath(FAKE_SESSION, "/input"), params: { projectId, sessionId: FAKE_SESSION }, body: { data: "ls\n" } },
  terminal_read: { handler: terminalReadRoute, method: "GET", path: sessionPath(FAKE_SESSION, "/output"), params: { projectId, sessionId: FAKE_SESSION } },
  terminal_resize: { handler: terminalResizeRoute, method: "POST", path: sessionPath(FAKE_SESSION, "/resize"), params: { projectId, sessionId: FAKE_SESSION }, body: { cols: 100, rows: 30 } },
  terminal_close: { handler: terminalCloseRoute, method: "DELETE", path: sessionPath(FAKE_SESSION), params: { projectId, sessionId: FAKE_SESSION } },
  list_files: { handler: listFilesRoute, method: "GET", path: `/projects/${projectId}/files?path=shared`, params: { projectId } },
  read_file: { handler: readFileRoute, method: "GET", path: `/projects/${projectId}/files/content?path=shared/a.txt`, params: { projectId } },
  download_file: { handler: downloadFileRoute, method: "GET", path: `/projects/${projectId}/files/download?path=shared/a.bin`, params: { projectId } },
  write_file: { handler: writeFileRoute, method: "PUT", path: `/projects/${projectId}/files/content`, params: { projectId }, body: { path: "shared/a.txt", content: "hi" } },
  make_folder: { handler: makeFolderRoute, method: "POST", path: `/projects/${projectId}/files/folders`, params: { projectId }, body: { path: "shared/uploads" } },
  rename_file: { handler: renameFileRoute, method: "POST", path: `/projects/${projectId}/files/rename`, params: { projectId }, body: { from: "shared/a.txt", to: "shared/b.txt" } },
  delete_file: { handler: deleteFileRoute, method: "DELETE", path: `/projects/${projectId}/files?path=shared/a.txt`, params: { projectId } },
});
const callSpec = (spec: Spec, secret: string | null, projectOverride?: string) => {
  const path = projectOverride ? spec.path.replace(projectId, projectOverride) : spec.path;
  return run(spec.handler, req(path, { method: spec.method, secret, body: spec.body }), { ...spec.params, ...(projectOverride ? { projectId: projectOverride } : {}) });
};
const SCOPE_OF: Record<string, Scope> = {
  terminal_status: "terminal:use", terminal_open: "terminal:use", terminal_send: "terminal:use", terminal_read: "terminal:use",
  terminal_resize: "terminal:use", terminal_close: "terminal:use",
  list_files: "files:read", read_file: "files:read", download_file: "files:read",
  write_file: "files:write", make_folder: "files:write", rename_file: "files:write", delete_file: "files:write",
};

describe("the terminal and file endpoints", () => {
  it("are all in the endpoint list with the scope they need", () => {
    const shellIds = ENDPOINTS.filter((e) => e.tag === "Terminal" || e.tag === "Files");
    expect(shellIds.map((e) => e.id).sort()).toEqual(Object.keys(SPECS()).sort());
    for (const ep of shellIds) expect(ep.scope, ep.id).toBe(SCOPE_OF[ep.id]);
  });

  it("answers 401 without a token", async () => {
    for (const [id, spec] of Object.entries(SPECS())) {
      const res = await callSpec(spec, null);
      expect(res.status, id).toBe(401);
    }
    expect(connects).toBe(0);
    expect(sshWasUsed()).toBe(false);
  });

  it("answers 403 naming the scope when a token lacks it, even with the switches on, and does nothing", async () => {
    await on({ terminal: true, fileWrites: true });
    for (const [id, spec] of Object.entries(SPECS())) {
      const without = await token(ALL.filter((s) => s !== SCOPE_OF[id]));
      const res = await callSpec(spec, without);
      const e = await errorOf(res);
      expect(res.status, id).toBe(403);
      expect(e.code, id).toBe("forbidden");
      expect(e.message, id).toContain(SCOPE_OF[id]);
    }
    expect(connects).toBe(0);
    expect(sshWasUsed()).toBe(false);
    expect(await auditRows("terminal.open")).toHaveLength(0);
  });

  it("does not let files:read stand in for files:write, or files:write for terminal:use", async () => {
    await on({ terminal: true, fileWrites: true });
    const reader = await token(["files:read"]);
    for (const id of ["write_file", "make_folder", "rename_file", "delete_file", "terminal_open"]) {
      expect((await callSpec(SPECS()[id], reader)).status, id).toBe(403);
    }
    const writer = await token(["files:write"]);
    expect((await callSpec(SPECS().list_files, writer)).status).toBe(403);
    expect((await callSpec(SPECS().terminal_open, writer)).status).toBe(403);
  });

  it("answers 404 for another user's project on every one of them, with the switches on", async () => {
    await on({ terminal: true, fileWrites: true });
    const secret = await token();
    for (const [id, spec] of Object.entries(SPECS())) {
      const res = await callSpec(spec, secret, theirProjectId);
      expect(await errorOf(res), id).toMatchObject({ status: 404, code: "not_found" });
    }
    for (const id of ["no-such-project"]) {
      expect((await callSpec(SPECS().terminal_open, secret, id)).status).toBe(404);
      expect((await callSpec(SPECS().write_file, secret, id)).status).toBe(404);
    }
    expect(connects).toBe(0);
    expect(sshWasUsed()).toBe(false);
  });
});

// -------------------------------------------------------------- the switches

describe("the owner's switches", () => {
  it("refuse the terminal with 403 disabled before any SSH when the terminal is off", async () => {
    const secret = await token();
    for (const id of ["terminal_open", "terminal_send", "terminal_resize"]) {
      const res = await callSpec(SPECS()[id], secret);
      expect(await errorOf(res), id).toMatchObject({ status: 403, code: "disabled", message: expect.stringContaining("terminal is turned off") });
    }
    expect(connects).toBe(0);
    expect(sshWasUsed()).toBe(false);
  });

  it("refuse every file change with 403 disabled before any SSH when file changes are off", async () => {
    const secret = await token();
    for (const id of ["write_file", "make_folder", "rename_file", "delete_file"]) {
      const res = await callSpec(SPECS()[id], secret);
      expect(await errorOf(res), id).toMatchObject({ status: 403, code: "disabled", message: expect.stringContaining("Changing files is turned off") });
    }
    expect(sshWasUsed()).toBe(false);
    expect(await auditRows("file.write")).toHaveLength(0);
  });

  it("do not stand in for each other: the terminal switch does not allow file changes and the reverse", async () => {
    const secret = await token();
    await on({ terminal: true, fileWrites: false });
    expect((await callSpec(SPECS().write_file, secret)).status).toBe(403);
    await on({ terminal: false, fileWrites: true });
    expect((await callSpec(SPECS().terminal_open, secret)).status).toBe(403);
    expect(connects).toBe(0);
  });

  it("do not block reading files, which has no switch", async () => {
    const secret = await token(["files:read"]);
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: "" });
    expect((await callSpec(SPECS().list_files, secret)).status).toBe(200);
  });

  it("close a terminal that was open when the owner switches the terminal off", async () => {
    await on({ terminal: true });
    const t = await mint(["terminal:use"]);
    const { json } = await openTerminal(t.secret);
    await terminals().closeAllForUser(me.id, "disabled", { serverId: myServerId });
    await on({ terminal: false });
    const res = await sendTo(t.secret, json.session.sessionId, "echo hi\n");
    expect(res.status).toBe(403);
    expect(shells[0].written).toEqual([]);
    expect(shells[0].closed).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------- terminal

describe("using a terminal", () => {
  beforeEach(async () => {
    await on({ terminal: true });
  });

  it("opens one, returns its id and limits, and audits it with the token (and no input)", async () => {
    const t = await mint(["terminal:use"]);
    const { res, json } = await openTerminal(t.secret, { cols: 120, rows: 40 });
    expect(res.status).toBe(201);
    expect(json.offset).toBe(0);
    expect(json.session).toMatchObject({ banner: "This shell runs as root on sam.hackclub.app.", identity: "root", host: "sam.hackclub.app", idleMs: TERMINAL_LIMITS.idleMs, maxAgeMs: TERMINAL_LIMITS.maxAgeMs });
    expect(json.session.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new Date(json.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(connects).toBe(1);
    expect(sshWasUsed()).toBe(false); // the terminal opens its own connection, through the manager

    const [open] = (await auditRows("terminal.open")).filter((r) => r.meta?.token === t.id);
    expect(open.target).toBe(projectId);
    expect(open.meta).toEqual({ project: projectId, via: "api", token: t.id });
  });

  it("refuses a second terminal for the project, bad sizes and unknown fields", async () => {
    const secret = await token(["terminal:use"]);
    expect((await openTerminal(secret)).res.status).toBe(201);
    expect((await run(terminalOpenRoute, req(`/projects/${projectId}/terminal`, { secret, method: "POST", body: {} }), { projectId })).status).toBe(409);
    terminals().closeAll();
    rateLimiter().clear();
    for (const body of [{ cols: 5 }, { cols: 401 }, { rows: 4 }, { rows: 201 }, { cols: 80.5 }, { cols: "80" }, { shell: "/bin/sh" }, { cwd: "/" }, "nope"]) {
      expect((await run(terminalOpenRoute, req(`/projects/${projectId}/terminal`, { secret, method: "POST", body }), { projectId })).status, JSON.stringify(body)).toBe(400);
    }
    expect(connects).toBe(1);
  });

  it("reports the open session so a lost id can be found again", async () => {
    const secret = await token(["terminal:use"]);
    const get = async () => (await (await run(terminalStatusRoute, req(`/projects/${projectId}/terminal`, { secret }), { projectId })).json()).session;
    expect(await get()).toBeNull();
    const { json } = await openTerminal(secret);
    expect((await get()).sessionId).toBe(json.session.sessionId);
  });

  it("types exactly what it is given into the shell, and returns nothing about it", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const typed = "echo super-secret-typed-text\n";
    const res = await sendTo(secret, json.session.sessionId, typed);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("super-secret-typed-text");
    expect(JSON.parse(body)).toEqual({ expiresAt: expect.any(String) });
    expect(shells[0].written).toEqual([typed]);

    const everything = JSON.stringify(await ctx.db.select().from(schema.auditLog)) + JSON.stringify(spy.mock.calls) + JSON.stringify(warn.mock.calls);
    expect(everything).not.toContain("super-secret-typed-text");
    spy.mockRestore();
    warn.mockRestore();
  });

  it("refuses empty or oversized input, unknown fields, and unknown or malformed session ids", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    const post = (sessionId: string, body: unknown) => run(terminalSendRoute, req(sessionPath(sessionId, "/input"), { secret, method: "POST", body }), { projectId, sessionId });
    for (const body of [{ data: "" }, { data: "x".repeat(TERMINAL_LIMITS.inputBytes + 1) }, { data: 5 }, {}, { data: "x", extra: 1 }, "nope"]) {
      expect((await post(id, body)).status, JSON.stringify(body).slice(0, 30)).toBe(400);
    }
    // A string under the character limit can still be over the byte limit.
    expect((await post(id, { data: "é".repeat(TERMINAL_LIMITS.inputBytes) })).status).toBe(413);
    expect((await post("B".repeat(22), { data: "x" })).status).toBe(404);
    expect((await post("not-an-id", { data: "x" })).status).toBe(404);
    expect(shells[0].written).toEqual([]);
  });

  it("returns new output since an offset and says where to resume", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    expect(await readFrom(secret, id, 0)).toMatchObject({ text: "", offset: 0, startOffset: 0, missed: false, ended: null });

    shells[0].emit("hello ");
    shells[0].emit("world\n");
    const first = await readFrom(secret, id, 0);
    expect(first).toMatchObject({ text: "hello world\n", offset: 12, startOffset: 0, missed: false });
    expect(await readFrom(secret, id, first.offset)).toMatchObject({ text: "", offset: 12 });

    shells[0].emit("more");
    expect(await readFrom(secret, id, 12)).toMatchObject({ text: "more", offset: 16 });
    // Asking from the middle returns the rest, and asking past the end returns nothing.
    expect(await readFrom(secret, id, 6)).toMatchObject({ text: "world\nmore", offset: 16 });
    expect(await readFrom(secret, id, 999)).toMatchObject({ text: "", offset: 16 });
  });

  it("does not cut a character in two between reads", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    const euro = Buffer.from("€"); // three bytes
    shells[0].emit(Buffer.concat([Buffer.from("a"), euro.subarray(0, 2)]));
    const part = await readFrom(secret, id, 0);
    expect(part).toMatchObject({ text: "a", offset: 1 });
    shells[0].emit(euro.subarray(2));
    const rest = await readFrom(secret, id, part.offset);
    expect(rest).toMatchObject({ text: "€", offset: 4 });
    expect(completeUtf8(Buffer.from("ab"))).toBe(2);
    expect(completeUtf8(euro.subarray(0, 1))).toBe(0);
    expect(completeUtf8(euro)).toBe(3);
  });

  it("tells a slow reader it missed output, and keeps only the newest 64 KB", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    const total = TERMINAL_LIMITS.bufferBytes * 2 + 100;
    shells[0].emit("x".repeat(total));
    const out = await readFrom(secret, id, 0);
    expect(out.missed).toBe(true);
    expect(out.offset).toBe(total);
    expect(out.startOffset).toBe(total - TERMINAL_LIMITS.bufferBytes);
    expect(Buffer.byteLength(out.text)).toBe(TERMINAL_LIMITS.bufferBytes);
    // Resuming from the offset it gave is clean.
    expect(await readFrom(secret, id, out.offset)).toMatchObject({ text: "", missed: false });
  });

  it("does not count reading as activity, but counts typing", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const secret = await token(["terminal:use"]);
      const { json } = await openTerminal(secret);
      const id = json.session.sessionId;
      const start = new Date(json.session.expiresAt).getTime();
      vi.advanceTimersByTime(5 * 60_000);
      await readFrom(secret, id, 0);
      expect(new Date((await readFrom(secret, id, 0)).expiresAt).getTime()).toBe(start);
      await sendTo(secret, id, "ls\n");
      expect(new Date((await readFrom(secret, id, 0)).expiresAt).getTime()).toBe(start + 5 * 60_000);
      // Ten minutes without typing ends it.
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect((await readFrom(secret, id, 0)).ended).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports why a session ended, and refuses input to it", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    shells[0].drop("exit");
    expect(await readFrom(secret, id, 0)).toMatchObject({ ended: "shell-exit", text: "", expiresAt: null });
    expect((await sendTo(secret, id, "x")).status).toBe(404);
    // A new one can be opened afterwards.
    expect((await openTerminal(secret)).res.status).toBe(201);
  });

  it("resizes within limits and refuses the rest", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    const resize = (body: unknown) => run(terminalResizeRoute, req(sessionPath(id, "/resize"), { secret, method: "POST", body }), { projectId, sessionId: id });
    expect((await resize({ cols: 132, rows: 43 })).status).toBe(200);
    expect(shells[0].sizes).toEqual([{ cols: 132, rows: 43 }]);
    for (const body of [{ cols: 5, rows: 24 }, { cols: 80, rows: 500 }, { cols: 80 }, { cols: 80.5, rows: 24 }]) {
      expect((await resize(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(shells[0].sizes).toHaveLength(1);
  });

  it("closes it, audits the close with the token and the reason, and the id then reports ended", async () => {
    const t = await mint(["terminal:use"]);
    const { json } = await openTerminal(t.secret);
    const id = json.session.sessionId;
    const res = await run(terminalCloseRoute, req(sessionPath(id), { secret: t.secret, method: "DELETE" }), { projectId, sessionId: id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ closed: true });
    expect(shells[0].closed).toBeGreaterThan(0);
    const mine = async () => (await auditRows("terminal.close")).filter((r) => r.meta?.token === t.id);
    await vi.waitFor(async () => expect(await mine()).toHaveLength(1));
    const [close] = await mine();
    expect(close.meta).toMatchObject({ project: projectId, reason: "closed", via: "api", token: t.id });
    expect(Object.keys(close.meta!).sort()).toEqual(["project", "reason", "seconds", "token", "via"]);
    expect(await readFrom(t.secret, id, 0)).toMatchObject({ ended: "closed" });
    expect((await run(terminalCloseRoute, req(sessionPath(id), { secret: t.secret, method: "DELETE" }), { projectId, sessionId: id })).status).toBe(404);
  });

  it("keeps a session to its owner: another user's token cannot read, type into or close it", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    const intruder = await mint(["terminal:use"], other.id);
    await setPermissions(other.id, (await ctx.db.select().from(schema.servers).where(eq(schema.servers.userId, other.id)).get())!.id, { terminal: true });
    for (const call of [
      () => run(terminalReadRoute, req(sessionPath(id, "/output"), { secret: intruder.secret }), { projectId, sessionId: id }),
      () => run(terminalSendRoute, req(sessionPath(id, "/input"), { secret: intruder.secret, method: "POST", body: { data: "id\n" } }), { projectId, sessionId: id }),
      () => run(terminalCloseRoute, req(sessionPath(id), { secret: intruder.secret, method: "DELETE" }), { projectId, sessionId: id }),
      // Their own project id with my session id.
      () => run(terminalReadRoute, req(`/projects/${theirProjectId}/terminal/${id}/output`, { secret: intruder.secret }), { projectId: theirProjectId, sessionId: id }),
    ]) {
      expect((await call()).status).toBe(404);
    }
    expect(shells[0].written).toEqual([]);
    expect(shells[0].closed).toBe(0);
  });

  it("allows 300 keystroke requests a minute and then 429, without touching the read or write buckets", async () => {
    const secret = await token(["terminal:use"]);
    const { json } = await openTerminal(secret);
    const id = json.session.sessionId;
    for (let i = 0; i < 300; i++) {
      const res = await sendTo(secret, id, "a");
      if (res.status !== 200) throw new Error(`request ${i} gave ${res.status}`);
    }
    const blocked = await sendTo(secret, id, "a");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(shells[0].written).toHaveLength(300);
    expect((await run(terminalReadRoute, req(sessionPath(id, "/output"), { secret }), { projectId, sessionId: id })).status).toBe(200);
  });

  it("opening a terminal uses the small SSH allowance of 10 a minute", async () => {
    const secret = await token(["terminal:use"]);
    for (let i = 0; i < 10; i++) {
      const { res } = await openTerminal(secret);
      expect([201, 409]).toContain(res.status);
    }
    expect((await openTerminal(secret)).res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------- files

describe("reading files", () => {
  const NUL = "\0";
  const listing = ["f", "f", "12", "1762300000.5", "a.txt", "", "d", "d", "4096", "1762300001.0", "uploads", ""].join(NUL) + NUL;

  it("lists a folder with names, types and sizes, and refuses a path that leaves the project", async () => {
    const secret = await token(["files:read"]);
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: listing });
    const res = await callSpec(SPECS().list_files, secret);
    expect(res.status).toBe(200);
    const { listing: out } = await res.json();
    expect(out).toMatchObject({ path: "shared", scope: { area: "shared", writable: true, liveRelease: false }, truncated: false });
    expect(out.entries.map((e: { name: string; type: string }) => `${e.name}:${e.type}`)).toEqual(["uploads:dir", "a.txt:file"]);
    expect(await auditRows("file.write")).toHaveLength(0); // reads are not audited

    const before = execCalls().length;
    for (const path of ["../etc", "/etc", "a//b", "shared/../../x", "a\0b"]) {
      const r = await run(listFilesRoute, req(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`, { secret }), { projectId });
      expect(r.status, path).toBe(400);
    }
    expect(execCalls().length).toBe(before);
  });

  it("reads a text file, flags a binary one, and passes the container's errors on plainly", async () => {
    const secret = await token(["files:read"]);
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: `5\n${b64("hello")}` });
    const ok = await (await callSpec(SPECS().read_file, secret)).json();
    expect(ok.file).toMatchObject({ path: "shared/a.txt", size: 5, binary: false, truncated: false, content: "hello", liveRelease: false, writable: true });

    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: `3\n${b64(Buffer.from([0, 1, 2]))}` });
    expect((await (await callSpec(SPECS().read_file, secret)).json()).file).toMatchObject({ binary: true, content: null });

    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 30, stderr: "/home/sam/.nest-deploy/app/shared/a.txt: no such file" });
    const missing = await callSpec(SPECS().read_file, secret);
    expect(await errorOf(missing)).toMatchObject({ status: 404, code: "not_found" });
  });

  it("refuses the files where environment values are kept, before any SSH", async () => {
    const secret = await token(["files:read"]);
    for (const path of ["current/.env", "current/./.env", "releases/0a1b2c3d-0000-4000-8000-000000000000/.env"]) {
      for (const [handler, base] of [[readFileRoute, "content"], [downloadFileRoute, "download"]] as const) {
        const res = await run(handler, req(`/projects/${projectId}/files/${base}?path=${encodeURIComponent(path)}`, { secret }), { projectId });
        expect(await errorOf(res), `${base} ${path}`).toMatchObject({ status: 403, code: "secret_file" });
      }
    }
    expect(execCalls()).toHaveLength(0);
    expect(sshWasUsed()).toBe(false);
    // A file merely called .env.example somewhere else is an ordinary file.
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: `2\n${b64("ok")}` });
    const ok = await run(readFileRoute, req(`/projects/${projectId}/files/content?path=current/.env.example`, { secret }), { projectId });
    expect(ok.status).toBe(200);
  });

  it("downloads a small file as base64 and refuses a big one", async () => {
    const secret = await token(["files:read"]);
    const bytes = Buffer.from([1, 2, 3, 250, 251]);
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 0, stdout: `5\n${b64(bytes)}` });
    const out = (await (await callSpec(SPECS().download_file, secret)).json()).file;
    expect(out).toMatchObject({ path: "shared/a.bin", name: "a.bin", size: 5 });
    expect(Buffer.from(out.contentBase64, "base64").equals(bytes)).toBe(true);
    const call = remoteCalls().find((c) => c.kind === "download")!;
    expect(call.command).toContain(String(2 * 1024 * 1024));

    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 35 });
    const big = await callSpec(SPECS().download_file, secret);
    expect(await errorOf(big)).toMatchObject({ status: 413, code: "too_large", message: expect.stringContaining("2 MB") });
  });

  it("uses the small SSH allowance of 10 a minute", async () => {
    const secret = await token(["files:read"]);
    for (let i = 0; i < 10; i++) expect((await callSpec(SPECS().list_files, secret)).status).toBe(200);
    expect((await callSpec(SPECS().list_files, secret)).status).toBe(429);
  });
});

describe("changing files", () => {
  beforeEach(async () => {
    await on({ fileWrites: true });
  });

  it("writes into shared/, audits it with the token and the path but never the contents", async () => {
    const t = await mint(["files:write"]);
    const content = "line one\nthe-file-contents-are-private\n";
    const res = await run(writeFileRoute, req(`/projects/${projectId}/files/content`, { secret: t.secret, method: "PUT", body: { path: "shared/notes/a.txt", content } }), { projectId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "shared/notes/a.txt" });
    const call = remoteCalls().find((c) => c.kind === "write")!;
    expect(call.opts!.stdin!.toString("utf8")).toBe(content);
    expect(call.command).toContain("'shared/notes/a.txt'");
    expect(call.command).toMatch(/ '0'$/); // no overwrite unless asked

    const [entry] = await auditRows("file.write");
    expect(entry.meta).toEqual({ path: "shared/notes/a.txt", via: "api", token: t.id });
    expect(JSON.stringify(await ctx.db.select().from(schema.auditLog))).not.toContain("the-file-contents-are-private");
  });

  it("writes base64 as the exact bytes, and overwrites only when asked", async () => {
    const secret = await token(["files:write"]);
    const bytes = Buffer.from([0, 255, 128, 7]);
    const put = (body: unknown) => run(writeFileRoute, req(`/projects/${projectId}/files/content`, { secret, method: "PUT", body }), { projectId });
    expect((await put({ path: "shared/x.bin", content: b64(bytes), encoding: "base64", overwrite: true })).status).toBe(200);
    const call = remoteCalls().find((c) => c.kind === "write")!;
    expect(call.opts!.stdin!.equals(bytes)).toBe(true);
    expect(call.command).toMatch(/ '1'$/);

    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 38 });
    expect(await errorOf(await put({ path: "shared/x.bin", content: "a" }))).toMatchObject({ status: 409, code: "exists" });
  });

  it("refuses the live release, the shared folder itself, escapes and bad input, before any SSH", async () => {
    const writesBefore = (await auditRows("file.write")).length;
    const secret = await token(["files:write"]);
    const put = (body: unknown) => {
      rateLimiter().clear(); // many refusals in a row: this test is about what is refused, not the SSH allowance
      return run(writeFileRoute, req(`/projects/${projectId}/files/content`, { secret, method: "PUT", body }), { projectId });
    };
    for (const [path, status, code] of [
      ["current/server.js", 403, "read_only"],
      ["current", 403, "read_only"],
      ["releases/abc/x", 403, "read_only"],
      ["shared", 403, "read_only"],
      ["other/x", 403, "read_only"],
      ["", 400, "validation"],
      ["../x", 400, "bad_path"],
      ["/etc/passwd", 400, "bad_path"],
      ["shared//x", 400, "bad_path"],
    ] as const) {
      const res = await put({ path, content: "x", overwrite: true });
      expect(await errorOf(res), path).toMatchObject({ status, code });
    }
    for (const body of [{ path: "shared/a", content: 5 }, { path: "shared/a" }, { content: "x" }, { path: "shared/a", content: "x", encoding: "hex" }, { path: "shared/a", content: "x", mode: "777" }, { path: "shared/a", content: "!!!", encoding: "base64" }, "nope"]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await put({ path: "shared/big", content: "x".repeat(1_100_000) })).status).toBe(413);
    expect(execCalls()).toHaveLength(0);
    expect(sshWasUsed()).toBe(false);
    expect(await auditRows("file.write")).toHaveLength(writesBefore);
  });

  it("makes a folder, renames, and deletes with the token in each audit entry", async () => {
    const t = await mint(["files:write"]);
    const mk = await run(makeFolderRoute, req(`/projects/${projectId}/files/folders`, { secret: t.secret, method: "POST", body: { path: "shared/uploads" } }), { projectId });
    expect(mk.status).toBe(201);
    expect(await mk.json()).toEqual({ path: "shared/uploads" });
    const mv = await run(renameFileRoute, req(`/projects/${projectId}/files/rename`, { secret: t.secret, method: "POST", body: { from: "shared/a.txt", to: "shared/uploads/a.txt" } }), { projectId });
    expect(await mv.json()).toEqual({ from: "shared/a.txt", to: "shared/uploads/a.txt" });
    const rm = await run(deleteFileRoute, req(`/projects/${projectId}/files?path=shared/uploads&recursive=true`, { secret: t.secret, method: "DELETE" }), { projectId });
    expect(rm.status).toBe(200);
    expect(remoteCalls().find((c) => c.kind === "delete")!.command).toMatch(/ '1'$/);

    expect((await auditRows("file.mkdir"))[0].meta).toEqual({ path: "shared/uploads", via: "api", token: t.id });
    expect((await auditRows("file.rename"))[0].meta).toEqual({ from: "shared/a.txt", to: "shared/uploads/a.txt", via: "api", token: t.id });
    expect((await auditRows("file.delete"))[0].meta).toEqual({ path: "shared/uploads", via: "api", token: t.id });
  });

  it("does not delete a folder without recursive, and refuses current/ for rename and delete", async () => {
    const secret = await token(["files:write"]);
    const del = (q: string) => run(deleteFileRoute, req(`/projects/${projectId}/files?${q}`, { secret, method: "DELETE" }), { projectId });
    execReply = (kind) => (kind === "home" ? { code: 0, stdout: "/home/sam" } : { code: 37 });
    expect(await errorOf(await del("path=shared/uploads"))).toMatchObject({ status: 409, code: "is_folder" });
    expect(remoteCalls().find((c) => c.kind === "delete")!.command).toMatch(/ '0'$/);
    const before = execCalls().length;
    expect((await del("path=current/server.js&recursive=true")).status).toBe(403);
    expect((await del("path=shared")).status).toBe(403);
    for (const bad of ["", "recursive=true", "path=shared/a&recursive=maybe"]) {
      expect((await del(bad)).status, bad).toBe(400);
    }
    expect(execCalls().length).toBe(before); // none of those reached the container
    const rn = (from: string, to: string) => run(renameFileRoute, req(`/projects/${projectId}/files/rename`, { secret, method: "POST", body: { from, to } }), { projectId });
    expect((await rn("current/a", "shared/a")).status).toBe(403);
    expect((await rn("shared/a", "current/a")).status).toBe(403);
    expect((await rn("shared/a", "shared/a")).status).toBe(400);
    expect((await rn("shared/a", "shared/a/b")).status).toBe(400);
  });

  it("is limited to 60 changes a minute per person, and to the small SSH allowance per token", async () => {
    const secret = await token(["files:write"]);
    const mk = (i: number) => run(makeFolderRoute, req(`/projects/${projectId}/files/folders`, { secret, method: "POST", body: { path: `shared/d${i}` } }), { projectId });
    for (let i = 0; i < 10; i++) expect((await mk(i)).status).toBe(201);
    expect((await mk(10)).status).toBe(429);
  });
});

describe("the excluded operations", () => {
  it("have no endpoint: nothing removes leftovers, changes permissions, or manages sessions, accounts or tokens", () => {
    // Terminal sessions are /terminal/{sessionId}; the browser sessions of an account are /sessions.
    const bad = /\/(orphans?|permissions?|sessions?|account|tokens?|leftovers?|rotate-key)(\/|$)/;
    expect(ENDPOINTS.filter((e) => bad.test(e.path)).map((e) => e.id)).toEqual([]);
    expect(ENDPOINTS.filter((e) => /orphan|permission|account|token|leftover|rotate_key|revoke_session/.test(e.id)).map((e) => e.id)).toEqual([]);
    // Nothing changes a server at all.
    expect(ENDPOINTS.filter((e) => e.path.startsWith("/servers") && !e.readOnly)).toEqual([]);
  });
});
