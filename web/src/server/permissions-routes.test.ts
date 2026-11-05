import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { deleteAccount, revokeOtherSessions, revokeSession } from "@/server/account";
import { SESSION_COOKIE, createSession, upsertUser, userForSessionToken } from "@/server/auth/session";
import { sha256Hex } from "@/server/crypto";
import { schema } from "@/server/db";
import { setPermissions } from "@/server/permissions";
import { createProject } from "@/server/projects";
import { RATE_LIMITS, rateLimiter } from "@/server/rate-limit";
import { TerminalManager } from "@/server/terminal";
import type { ShellHandle } from "@/server/ssh/shell";
import { useFreshDb } from "@/server/test/db";

// The route layer, the database, ownership and the switches are real. Sign-in and SSH are replaced.
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
import { GET as getPermissionsRoute, PUT as putPermissionsRoute } from "@/app/api/servers/[id]/permissions/route";
import { POST as removeOrphansRoute } from "@/app/api/servers/[id]/orphans/route";
import { POST as openTerminal } from "@/app/api/projects/[id]/terminal/route";
import { POST as sendInput } from "@/app/api/projects/[id]/terminal/[sessionId]/input/route";
import { GET as list } from "@/app/api/projects/[id]/files/list/route";
import { GET as read } from "@/app/api/projects/[id]/files/read/route";
import { POST as write } from "@/app/api/projects/[id]/files/write/route";
import { POST as mkdir } from "@/app/api/projects/[id]/files/mkdir/route";
import { POST as rename } from "@/app/api/projects/[id]/files/rename/route";
import { POST as remove } from "@/app/api/projects/[id]/files/delete/route";
import { POST as logout } from "@/app/api/auth/logout/route";

class FakeShell implements ShellHandle {
  written: string[] = [];
  closed = 0;
  write(d: string) {
    this.written.push(d);
  }
  resize() {}
  onData() {}
  onClose() {}
  close() {
    this.closed += 1;
  }
}

type Ctx = Awaited<ReturnType<typeof useFreshDb>>;
let ctx: Ctx;
type Person = { id: string; name: string; email: string | null; hackClubId: string };
let sam: Person;
let kim: Person;
let samServer: string;
let samOtherServer: string;
let kimServer: string;
let samProject: string;
let samOtherProject: string;
let kimProject: string;

const ORIGIN = "http://localhost:3000";
let shells: FakeShell[];
const connect = vi.fn();

const exec = vi.fn(async (command: string) => {
  if (command.includes('printf %s "$HOME"')) return { code: 0, stdout: "/home/sam", stderr: "" };
  return { code: 0, stdout: "", stderr: "" };
});
const sshSession = { exec, script: exec };

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const termCtx = (id: string, sessionId = "") => ({ params: Promise.resolve({ id, sessionId }) });
const fileUrl = (name: string, query: Record<string, string> = {}) => {
  const u = new URL(`${ORIGIN}/api/projects/x/files/${name}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
};
const fileGet = (name: string, query: Record<string, string>) => new NextRequest(fileUrl(name, query));
const sshWasUsed = () => vi.mocked(withServerSession).mock.calls.length > 0;

async function bodyOf(res: Response) {
  return (await res.json()) as { permissions?: Record<string, boolean>; error?: { code: string; message: string }; sessionId?: string };
}

beforeAll(async () => {
  ctx = await useFreshDb();
  sam = await upsertUser({ id: "pr1", name: "Sam", email: null, slackId: null });
  kim = await upsertUser({ id: "pr2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  samServer = (await createServer(sam.id, "sam-p1")).id;
  samOtherServer = (await createServer(sam.id, "sam-p2")).id;
  kimServer = (await createServer(kim.id, "kim-p1")).id;
  samProject = (await createProject(sam.id, { ...base, serverId: samServer, name: "App", slug: "app", port: 3000 })).id;
  samOtherProject = (await createProject(sam.id, { ...base, serverId: samOtherServer, name: "Two", slug: "two", port: 3001 })).id;
  kimProject = (await createProject(kim.id, { ...base, serverId: kimServer, name: "Theirs", slug: "theirs", port: 3002 })).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

let manager: TerminalManager;
beforeEach(async () => {
  rateLimiter().clear();
  shells = [];
  connect.mockReset();
  connect.mockImplementation(async () => {
    const shell = new FakeShell();
    shells.push(shell);
    return { shell, uid: 0, host: "sam-p1.hackclub.app" };
  });
  // Real ownership lookup, fake shell. Audit goes to the real log.
  manager = new TerminalManager({ connect });
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("nest-deploy.terminal-manager")] = manager;

  exec.mockClear();
  vi.mocked(withServerSession).mockReset();
  vi.mocked(withServerSession).mockImplementation(async (_s, fn) => fn(sshSession as never));
  vi.mocked(getCurrentUser).mockResolvedValue(sam as never);
  // Known starting point for every test.
  for (const [user, server] of [
    [sam, samServer],
    [sam, samOtherServer],
    [kim, kimServer],
  ] as const) {
    await setPermissions(user.id, server, { terminal: false, fileWrites: true, orphanRemoval: true });
  }
});

const closeAudits = async (userId: string) =>
  (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, userId)))
    .filter((r) => r.action === "terminal.close")
    .map((r) => JSON.parse(r.meta ?? "{}") as { reason: string });

describe("permissions API", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await getPermissionsRoute(json("/x", "GET"), idCtx(samServer))).status).toBe(401);
    expect((await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samServer))).status).toBe(401);
  });

  it("returns the defaults: terminal off, file writes on, leftover removal on", async () => {
    const fresh = (await createServer(sam.id, "sam-p3")).id;
    const res = await getPermissionsRoute(json("/x", "GET"), idCtx(fresh));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ permissions: { terminal: false, fileWrites: true, orphanRemoval: true } });
    await ctx.db.delete(schema.servers).where(eq(schema.servers.id, fresh));
  });

  it("answers 404 for another user's server and for one that does not exist, and changes nothing", async () => {
    for (const id of [kimServer, "no-such-server"]) {
      expect((await getPermissionsRoute(json("/x", "GET"), idCtx(id))).status).toBe(404);
      expect((await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(id))).status).toBe(404);
    }
    vi.mocked(getCurrentUser).mockResolvedValue(kim as never);
    const kims = await getPermissionsRoute(json("/x", "GET"), idCtx(kimServer));
    expect((await bodyOf(kims)).permissions?.terminal).toBe(false);
  });

  it("rejects bad bodies with 400", async () => {
    const bad: unknown[] = [
      {},
      { unknown: true },
      { terminal: true, extra: 1 },
      { terminal: "yes" },
      { terminal: 1 },
      { fileWrites: null },
      { orphanRemoval: "false" },
      [true],
      "true",
      "not json",
      { allowTerminal: true },
    ];
    for (const body of bad) {
      const res = await putPermissionsRoute(json("/x", "PUT", body), idCtx(samServer));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const empty = new NextRequest(`${ORIGIN}/x`, { method: "PUT", headers: { origin: ORIGIN } });
    expect((await putPermissionsRoute(empty, idCtx(samServer))).status).toBe(400);
    expect((await bodyOf(await getPermissionsRoute(json("/x", "GET"), idCtx(samServer)))).permissions).toEqual({
      terminal: false,
      fileWrites: true,
      orphanRemoval: true,
    });
  });

  it("blocks a cross-origin change", async () => {
    const res = await putPermissionsRoute(
      json("/x", "PUT", { terminal: true }, { origin: "https://evil.example" }),
      idCtx(samServer)
    );
    expect(res.status).toBe(403);
    expect((await bodyOf(await getPermissionsRoute(json("/x", "GET"), idCtx(samServer)))).permissions?.terminal).toBe(false);
  });

  it("round-trips: turns a switch on, leaves the others alone, and turns it back off", async () => {
    const on = await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samServer));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ permissions: { terminal: true, fileWrites: true, orphanRemoval: true } });
    const both = await putPermissionsRoute(
      json("/x", "PUT", { fileWrites: false, orphanRemoval: false }),
      idCtx(samServer)
    );
    expect((await bodyOf(both)).permissions).toEqual({ terminal: true, fileWrites: false, orphanRemoval: false });
    const got = await getPermissionsRoute(json("/x", "GET"), idCtx(samServer));
    expect((await bodyOf(got)).permissions).toEqual({ terminal: true, fileWrites: false, orphanRemoval: false });
    const off = await putPermissionsRoute(
      json("/x", "PUT", { terminal: false, fileWrites: true, orphanRemoval: true }),
      idCtx(samServer)
    );
    expect((await bodyOf(off)).permissions).toEqual({ terminal: false, fileWrites: true, orphanRemoval: true });
    // Another server of the same user was not touched.
    const other = await getPermissionsRoute(json("/x", "GET"), idCtx(samOtherServer));
    expect((await bodyOf(other)).permissions?.terminal).toBe(false);
  });

  it("audits a change by switch name only", async () => {
    await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samServer));
    const rows = (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, sam.id))).filter(
      (r) => r.action === "container.permissions"
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.at(-1)?.meta).toContain("Terminal");
  });

  it("closes the owner's open terminals on that server, and only those, when the terminal is turned off", async () => {
    await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samServer));
    await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samOtherServer));
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samProject))).status).toBe(201);
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samOtherProject))).status).toBe(201);
    vi.mocked(getCurrentUser).mockResolvedValue(kim as never);
    await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(kimServer));
    expect((await openTerminal(json("/x", "POST", {}), termCtx(kimProject))).status).toBe(201);
    vi.mocked(getCurrentUser).mockResolvedValue(sam as never);
    expect(manager.size).toBe(3);

    const res = await putPermissionsRoute(json("/x", "PUT", { terminal: false }), idCtx(samServer));
    expect(res.status).toBe(200);

    expect(manager.size).toBe(2);
    expect(manager.active(sam.id, samProject)).toBeNull();
    expect(manager.active(sam.id, samOtherProject)).not.toBeNull();
    expect(manager.active(kim.id, kimProject)).not.toBeNull();
    expect(shells.map((s) => s.closed)).toEqual([1, 0, 0]);
    expect((await closeAudits(sam.id)).at(-1)).toMatchObject({ reason: "disabled" });
  });

  it("does not close terminals when the terminal switch stays on", async () => {
    await putPermissionsRoute(json("/x", "PUT", { terminal: true }), idCtx(samServer));
    await openTerminal(json("/x", "POST", {}), termCtx(samProject));
    await putPermissionsRoute(json("/x", "PUT", { terminal: true, fileWrites: false }), idCtx(samServer));
    expect(manager.size).toBe(1);
  });
});

describe("enforcement", () => {
  it("refuses to open a terminal while it is off (403), before any SSH work", async () => {
    const res = await openTerminal(json("/x", "POST", { cols: 80, rows: 24 }), termCtx(samProject));
    const body = await bodyOf(res);
    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("disabled");
    expect(body.error?.message).toContain("The terminal is turned off");
    expect(connect).not.toHaveBeenCalled();
    expect(sshWasUsed()).toBe(false);
    expect(manager.size).toBe(0);
  });

  it("opens a terminal once it is switched on, and stops again when switched off", async () => {
    await setPermissions(sam.id, samServer, { terminal: true });
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samProject))).status).toBe(201);
    expect(connect).toHaveBeenCalledTimes(1);
    manager.closeAll();
    await setPermissions(sam.id, samServer, { terminal: false });
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samProject))).status).toBe(403);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("answers 404, not 403, for someone else's project, and the switch is per server", async () => {
    expect((await openTerminal(json("/x", "POST", {}), termCtx(kimProject))).status).toBe(404);
    await setPermissions(sam.id, samOtherServer, { terminal: true });
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samProject))).status).toBe(403);
    expect((await openTerminal(json("/x", "POST", {}), termCtx(samOtherProject))).status).toBe(201);
  });

  it("refuses all four file writes with 403 while file changes are off, and still reads", async () => {
    await setPermissions(sam.id, samServer, { fileWrites: false });
    const c = () => idCtx(samProject);
    const results = [
      await write(new NextRequest(fileUrl("write", { path: "shared/a.txt" }), { method: "POST", body: "x" }), c()),
      await mkdir(json("/x", "POST", { path: "shared/d" }), c()),
      await rename(json("/x", "POST", { from: "shared/a", to: "shared/b" }), c()),
      await remove(json("/x", "POST", { path: "shared/a" }), c()),
    ];
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect((await bodyOf(results[0])).error?.message).toContain("Changing files is turned off");
    expect(sshWasUsed()).toBe(false);

    // Reads, lists and downloads stay available.
    exec.mockImplementation(async (command: string) => {
      if (command.includes('printf %s "$HOME"')) return { code: 0, stdout: "/home/sam", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    });
    expect((await list(fileGet("list", { path: "shared" }), c())).status).toBe(200);
    expect((await read(fileGet("read", { path: "shared/a.txt" }), c())).status).not.toBe(403);
    expect(sshWasUsed()).toBe(true);
  });

  it("lets file writes through again when switched back on", async () => {
    await setPermissions(sam.id, samServer, { fileWrites: false });
    expect((await mkdir(json("/x", "POST", { path: "shared/d" }), idCtx(samProject))).status).toBe(403);
    await setPermissions(sam.id, samServer, { fileWrites: true });
    expect((await mkdir(json("/x", "POST", { path: "shared/d" }), idCtx(samProject))).status).toBe(201);
  });

  it("answers 404 for file writes on someone else's project, whatever the switch says", async () => {
    expect((await mkdir(json("/x", "POST", { path: "shared/d" }), idCtx(kimProject))).status).toBe(404);
    expect(sshWasUsed()).toBe(false);
  });

  it("refuses leftover removal with 403 while it is off, before validating or touching SSH", async () => {
    await setPermissions(sam.id, samServer, { orphanRemoval: false });
    for (const body of [{ ids: ["nd-old.service"] }, { ids: [] }, { nonsense: 1 }]) {
      const res = await removeOrphansRoute(json("/x", "POST", body), idCtx(samServer));
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect((await bodyOf(res)).error?.message).toContain("Removing leftovers is turned off");
    }
    expect(sshWasUsed()).toBe(false);
    // On again: validation runs, so an empty list is now a 400.
    await setPermissions(sam.id, samServer, { orphanRemoval: true });
    expect((await removeOrphansRoute(json("/x", "POST", { ids: [] }), idCtx(samServer))).status).toBe(400);
  });

  it("answers 404 for leftover removal on someone else's server", async () => {
    const res = await removeOrphansRoute(json("/x", "POST", { ids: ["nd-old.service"] }), idCtx(kimServer));
    expect(res.status).toBe(404);
    expect(sshWasUsed()).toBe(false);
  });
});

describe("rate limits", () => {
  it("limits terminal input to 300 requests a minute per user, with Retry-After", async () => {
    await setPermissions(sam.id, samServer, { terminal: true });
    const opened = await bodyOf(await openTerminal(json("/x", "POST", {}), termCtx(samProject)));
    const id = opened.sessionId as string;
    for (let i = 0; i < RATE_LIMITS.terminalInput.limit; i++) {
      const res = await sendInput(json("/x", "POST", { data: "a" }), termCtx(samProject, id));
      expect(res.status).toBe(200);
    }
    const res = await sendInput(json("/x", "POST", { data: "a" }), termCtx(samProject, id));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await bodyOf(res)).error?.code).toBe("rate_limited");
    expect(shells[0].written).toHaveLength(RATE_LIMITS.terminalInput.limit);
    // Another user is not affected.
    vi.mocked(getCurrentUser).mockResolvedValue(kim as never);
    const other = await sendInput(json("/x", "POST", { data: "a" }), termCtx(kimProject, "A".repeat(22)));
    expect(other.status).toBe(404);
  });

  it("limits file writes to 60 requests a minute per user across all four routes", async () => {
    for (let i = 0; i < RATE_LIMITS.fileWrite.limit; i++) {
      const res = await mkdir(json("/x", "POST", { path: `shared/d${i}` }), idCtx(samProject));
      expect(res.status).toBe(201);
    }
    for (const call of [
      () => mkdir(json("/x", "POST", { path: "shared/z" }), idCtx(samProject)),
      () => rename(json("/x", "POST", { from: "shared/a", to: "shared/b" }), idCtx(samProject)),
      () => remove(json("/x", "POST", { path: "shared/a" }), idCtx(samProject)),
      () => write(new NextRequest(fileUrl("write", { path: "shared/a.txt" }), { method: "POST", body: "x" }), idCtx(samProject)),
    ]) {
      const res = await call();
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    }
    // Reads are not limited.
    expect((await list(fileGet("list", { path: "shared" }), idCtx(samProject))).status).toBe(200);
  });

  it("does not count refused (403) file writes against the limit", async () => {
    await setPermissions(sam.id, samServer, { fileWrites: false });
    for (let i = 0; i < RATE_LIMITS.fileWrite.limit + 5; i++) {
      expect((await mkdir(json("/x", "POST", { path: "shared/d" }), idCtx(samProject))).status).toBe(403);
    }
    await setPermissions(sam.id, samServer, { fileWrites: true });
    expect((await mkdir(json("/x", "POST", { path: "shared/d" }), idCtx(samProject))).status).toBe(201);
  });

  it("limits leftover removal to 10 requests a minute per user", async () => {
    for (let i = 0; i < RATE_LIMITS.orphanRemoval.limit; i++) {
      const res = await removeOrphansRoute(json("/x", "POST", { ids: ["../../etc"] }), idCtx(samServer));
      expect(res.status).toBe(200);
    }
    const res = await removeOrphansRoute(json("/x", "POST", { ids: ["../../etc"] }), idCtx(samServer));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});

describe("terminals end when the account signs out", () => {
  async function openFor(person: Person, server: string, project: string) {
    await setPermissions(person.id, server, { terminal: true });
    vi.mocked(getCurrentUser).mockResolvedValue(person as never);
    const res = await openTerminal(json("/x", "POST", {}), termCtx(project));
    expect(res.status).toBe(201);
  }

  it("revokeSession closes the user's terminals, not another user's", async () => {
    await openFor(sam, samServer, samProject);
    await openFor(kim, kimServer, kimProject);
    const mine = await createSession(sam.id, "this browser");
    const old = await createSession(sam.id, "old laptop");

    await revokeSession(sam.id, sha256Hex(old.token), mine.token);

    expect(manager.active(sam.id, samProject)).toBeNull();
    expect(manager.active(kim.id, kimProject)).not.toBeNull();
    expect(shells.map((s) => s.closed)).toEqual([1, 0]);
    expect((await closeAudits(sam.id)).at(-1)).toMatchObject({ reason: "signed-out" });
  });

  it("revokeSession leaves terminals alone when nothing was revoked", async () => {
    await openFor(sam, samServer, samProject);
    await expect(revokeSession(sam.id, "no-such-session", undefined)).rejects.toMatchObject({ status: 404 });
    await expect(revokeSession(sam.id, sha256Hex("current"), "current")).rejects.toMatchObject({ status: 400 });
    expect(manager.active(sam.id, samProject)).not.toBeNull();
  });

  it("revokeOtherSessions closes them when other sessions were signed out", async () => {
    await openFor(sam, samServer, samProject);
    await ctx.db.delete(schema.sessions).where(eq(schema.sessions.userId, sam.id));
    const mine = await createSession(sam.id);
    await createSession(sam.id);
    expect(await revokeOtherSessions(sam.id, mine.token)).toBe(1);
    expect(manager.active(sam.id, samProject)).toBeNull();
    expect((await userForSessionToken(mine.token))?.id).toBe(sam.id);
  });

  it("revokeOtherSessions with no other session keeps the terminal", async () => {
    await openFor(sam, samServer, samProject);
    await ctx.db.delete(schema.sessions).where(eq(schema.sessions.userId, sam.id));
    const only = await createSession(sam.id);
    expect(await revokeOtherSessions(sam.id, only.token)).toBe(0);
    expect(manager.active(sam.id, samProject)).not.toBeNull();
  });

  it("the logout route closes the signed-in user's terminals and deletes the session", async () => {
    await openFor(sam, samServer, samProject);
    await openFor(kim, kimServer, kimProject);
    const { token } = await createSession(sam.id);
    const req = new NextRequest(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: `${SESSION_COOKIE}=${token}` },
    });

    const res = await logout(req, undefined);

    expect(res.status).toBe(303);
    expect(manager.active(sam.id, samProject)).toBeNull();
    expect(manager.active(kim.id, kimProject)).not.toBeNull();
    expect(await userForSessionToken(token)).toBeNull();
    expect((await closeAudits(sam.id)).at(-1)).toMatchObject({ reason: "signed-out" });
  });

  it("the logout route works without a session and closes nothing", async () => {
    await openFor(kim, kimServer, kimProject);
    const res = await logout(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: "POST" }), undefined);
    expect(res.status).toBe(303);
    expect(manager.active(kim.id, kimProject)).not.toBeNull();
  });

  it("deleteAccount closes the user's terminals first", async () => {
    const lee = await upsertUser({ id: "pr3", name: "Lee", email: null, slackId: null });
    const leeServer = (await createServer(lee.id, "lee-p1")).id;
    const leeProject = (
      await createProject(lee.id, {
        repoUrl: "https://github.com/lee/app.git",
        runtime: "node",
        serverId: leeServer,
        name: "Lee",
        slug: "lee",
        port: 3010,
      })
    ).id;
    await openFor(lee, leeServer, leeProject);
    await openFor(kim, kimServer, kimProject);

    await deleteAccount(lee.id, "Lee", "Lee");

    expect(manager.active(lee.id, leeProject)).toBeNull();
    expect(manager.active(kim.id, kimProject)).not.toBeNull();
    expect(manager.size).toBe(1);
  });
});
