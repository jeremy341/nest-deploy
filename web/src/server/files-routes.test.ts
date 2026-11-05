import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { createProject } from "@/server/projects";
import { SshError } from "@/server/ssh/connection";
import { rateLimiter } from "@/server/rate-limit";
import { useFreshDb } from "@/server/test/db";

// The route layer is real. Sign-in and the SSH session are replaced.
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
import { GET as list } from "@/app/api/projects/[id]/files/list/route";
import { GET as read } from "@/app/api/projects/[id]/files/read/route";
import { GET as download } from "@/app/api/projects/[id]/files/download/route";
import { POST as write } from "@/app/api/projects/[id]/files/write/route";
import { POST as mkdir } from "@/app/api/projects/[id]/files/mkdir/route";
import { POST as rename } from "@/app/api/projects/[id]/files/rename/route";
import { POST as remove } from "@/app/api/projects/[id]/files/delete/route";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let me: { id: string; name: string };
let other: { id: string; name: string };
let projectId: string;
let theirProjectId: string;

type Reply = { code: number; stdout?: string; stderr?: string };
const calls: { command: string; stdin?: string | Buffer }[] = [];
let reply: (command: string) => Reply = () => ({ code: 0 });

const session = {
  exec: vi.fn(async (command: string, opts?: { stdin?: string | Buffer }) => {
    calls.push({ command, stdin: opts?.stdin });
    if (command.includes('printf %s "$HOME"')) return { code: 0, stdout: "/home/sam", stderr: "" };
    const r = reply(command);
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }),
};

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (path: string, query: Record<string, string> = {}) => {
  const u = new URL(`http://localhost:3000/api/projects/x/files/${path}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
};
const get = (path: string, query: Record<string, string>) => new NextRequest(url(path, query));
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const upload = (query: Record<string, string>, body: string | Uint8Array, headers: Record<string, string> = {}) =>
  new NextRequest(url("write", query), { method: "POST", headers, body: body as BodyInit });

const sshWasUsed = () => vi.mocked(withServerSession).mock.calls.length > 0;
const auditRows = async () =>
  (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, me.id))).filter((r) =>
    r.action.startsWith("file.")
  );

beforeAll(async () => {
  ctx = await useFreshDb();
  me = await upsertUser({ id: "f1", name: "Sam", email: null, slackId: null });
  other = await upsertUser({ id: "f2", name: "Kim", email: null, slackId: null });
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  const myServer = (await createServer(me.id, "sam-r")).id;
  const theirServer = (await createServer(other.id, "kim-r")).id;
  projectId = (await createProject(me.id, { ...base, serverId: myServer, name: "App", slug: "app", port: 3000 })).id;
  theirProjectId = (await createProject(other.id, { ...base, serverId: theirServer, name: "Theirs", slug: "theirs", port: 3001 })).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

beforeEach(() => {
  // These tests make far more than 60 writes in a second; the limiter has its own tests.
  rateLimiter().clear();
  calls.length = 0;
  reply = () => ({ code: 0 });
  session.exec.mockClear();
  vi.mocked(withServerSession).mockReset();
  vi.mocked(withServerSession).mockImplementation(async (_server, fn) => fn(session as never));
  vi.mocked(getCurrentUser).mockResolvedValue(me as never);
});

async function errorOf(res: Response) {
  const body = await res.json();
  return { status: res.status, code: body.error?.code as string, message: body.error?.message as string };
}

describe("sign-in and ownership", () => {
  const all = (id: string) => [
    () => list(get("list", { path: "shared" }), ctxFor(id)),
    () => read(get("read", { path: "shared/a.txt" }), ctxFor(id)),
    () => download(get("download", { path: "shared/a.txt" }), ctxFor(id)),
    () => write(upload({ path: "shared/a.txt" }, "x"), ctxFor(id)),
    () => mkdir(post("mkdir", { path: "shared/d" }), ctxFor(id)),
    () => rename(post("rename", { from: "shared/a", to: "shared/b" }), ctxFor(id)),
    () => remove(post("delete", { path: "shared/a" }), ctxFor(id)),
  ];

  it("answers 401 when signed out, without touching SSH", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    for (const call of all(projectId)) {
      expect(await errorOf(await call())).toMatchObject({ status: 401, code: "unauthorized" });
    }
    expect(sshWasUsed()).toBe(false);
  });

  it("answers 404 for another user's project, without touching SSH or writing audit entries", async () => {
    for (const call of all(theirProjectId)) {
      expect(await errorOf(await call())).toMatchObject({ status: 404, code: "not_found" });
    }
    for (const call of all("no-such-project")) {
      expect((await call()).status).toBe(404);
    }
    expect(sshWasUsed()).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it("blocks writes from another origin", async () => {
    const evil = { origin: "http://evil.example" };
    const res = await mkdir(post("mkdir", { path: "shared/d" }, evil), ctxFor(projectId));
    expect(await errorOf(res)).toMatchObject({ status: 403, code: "csrf" });
    const res2 = await write(upload({ path: "shared/a.txt" }, "x", evil), ctxFor(projectId));
    expect(res2.status).toBe(403);
    expect(sshWasUsed()).toBe(false);
  });
});

describe("path rules at the route", () => {
  const traversal = ["../x", "shared/../../etc/passwd", "/etc/passwd", "shared//a", "shared/a\u0000b", "shared/.."];

  it("returns 400 for traversal and never touches SSH", async () => {
    for (const path of traversal) {
      const id = ctxFor(projectId);
      const results = [
        await list(get("list", { path }), id),
        await read(get("read", { path }), id),
        await download(get("download", { path }), ctxFor(projectId)),
        await write(upload({ path }, "x"), ctxFor(projectId)),
        await mkdir(post("mkdir", { path }), ctxFor(projectId)),
        await rename(post("rename", { from: path, to: "shared/ok" }), ctxFor(projectId)),
        await rename(post("rename", { from: "shared/ok", to: path }), ctxFor(projectId)),
        await remove(post("delete", { path, recursive: true }), ctxFor(projectId)),
      ];
      for (const res of results) {
        const e = await errorOf(res);
        expect(e.status, `${JSON.stringify(path)} ${e.message}`).toBe(400);
        expect(e.code).toBe("bad_path");
      }
    }
    expect(sshWasUsed()).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it("returns 403 for writes to read-only locations and never touches SSH", async () => {
    for (const path of ["", "shared", "current", "releases/abc/x", "incoming/a.tar.gz", "package.json"]) {
      expect(await errorOf(await write(upload({ path }, "x"), ctxFor(projectId)))).toMatchObject({ status: 403, code: "read_only" });
      expect((await mkdir(post("mkdir", { path }), ctxFor(projectId))).status).toBe(403);
      expect((await remove(post("delete", { path }), ctxFor(projectId))).status).toBe(403);
      expect((await rename(post("rename", { from: path, to: "shared/x" }), ctxFor(projectId))).status).toBe(403);
    }
    expect(sshWasUsed()).toBe(false);
  });

  it("rejects malformed bodies with 400", async () => {
    const res = await mkdir(new NextRequest(url("mkdir"), { method: "POST", body: "not json" }), ctxFor(projectId));
    expect(res.status).toBe(400);
    const res2 = await remove(post("delete", { recursive: true }), ctxFor(projectId));
    expect(res2.status).toBe(400);
    expect(sshWasUsed()).toBe(false);
  });

  it("allows reading the project folder and the read-only areas", async () => {
    reply = () => ({ code: 0, stdout: "" });
    for (const path of ["", "releases", "current", "incoming"]) {
      expect((await list(get("list", { path }), ctxFor(projectId))).status).toBe(200);
    }
  });
});

describe("operations", () => {
  it("lists a folder under the project's own folder", async () => {
    reply = () => ({ code: 0, stdout: ["f", "f", "6", "1730000000.0", "a.txt", ""].join("\0") + "\0" });
    const res = await list(get("list", { path: "shared" }), ctxFor(projectId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries[0]).toMatchObject({ name: "a.txt", type: "file", size: 6 });
    expect(body.scope).toMatchObject({ area: "shared", writable: true, temporary: false });
    const [, run] = calls;
    expect(run.command).toContain("'/home/sam/.nest-deploy/app' 'shared'");
  });

  it("reads text and reports binary without content", async () => {
    reply = () => ({ code: 0, stdout: `5\n${Buffer.from("hello").toString("base64")}` });
    const ok = await (await read(get("read", { path: "shared/a.txt" }), ctxFor(projectId))).json();
    expect(ok).toMatchObject({ content: "hello", binary: false, truncated: false, size: 5 });

    reply = () => ({ code: 0, stdout: `3\n${Buffer.from([0, 1, 2]).toString("base64")}` });
    const bin = await (await read(get("read", { path: "shared/b.bin" }), ctxFor(projectId))).json();
    expect(bin).toMatchObject({ binary: true, content: null });
  });

  it("downloads as an attachment, never inline", async () => {
    reply = () => ({ code: 0, stdout: `3\n${Buffer.from("abc").toString("base64")}` });
    const res = await download(get("download", { path: 'shared/we"ird é.html' }), ctxFor(projectId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const disposition = res.headers.get("content-disposition")!;
    expect(disposition.startsWith("attachment;")).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''we%22ird%20%C3%A9.html");
    expect(disposition).not.toMatch(/filename="[^"]*"[^;]*"/);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("abc");
  });

  it("writes, passes the bytes on stdin, and audits the path only", async () => {
    const secret = "SUPER-SECRET-FILE-CONTENTS";
    const res = await write(upload({ path: "shared/data/notes.txt", overwrite: "1" }, secret), ctxFor(projectId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "shared/data/notes.txt", temporary: false });

    const run = calls.find((c) => c.stdin !== undefined)!;
    expect(run.stdin!.toString()).toBe(secret);
    expect(run.command).not.toContain(secret);

    const rows = (await auditRows()).filter((r) => r.action === "file.write");
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(projectId);
    expect(JSON.parse(rows[0].meta!)).toEqual({ path: "shared/data/notes.txt" });
    expect(JSON.stringify(rows[0])).not.toContain(secret);
  });

  it("flags writes under current/ as temporary", async () => {
    const res = await write(upload({ path: "current/.env" }, "A=1"), ctxFor(projectId));
    expect(await res.json()).toEqual({ path: "current/.env", temporary: true });
  });

  it("passes overwrite=0 by default so existing files are not replaced silently", async () => {
    reply = () => ({ code: 38 });
    const res = await write(upload({ path: "shared/a.txt" }, "x"), ctxFor(projectId));
    expect(await errorOf(res)).toMatchObject({ status: 409, code: "exists" });
    expect(calls.find((c) => c.stdin !== undefined)!.command.endsWith("'shared/a.txt' '0'")).toBe(true);
    expect((await auditRows()).filter((r) => r.action === "file.write").map((r) => JSON.parse(r.meta!).path)).not.toContain(
      "shared/a.txt"
    );
  });

  it("refuses a body that arrived cut short, and one that is too large", async () => {
    const short = await write(upload({ path: "shared/cut.bin" }, "12345", { "content-length": "999" }), ctxFor(projectId));
    expect(await errorOf(short)).toMatchObject({ status: 400, code: "short_body" });
    const huge = await write(
      upload({ path: "shared/huge.bin" }, "x", { "content-length": String(60 * 1024 * 1024) }),
      ctxFor(projectId)
    );
    expect(await errorOf(huge)).toMatchObject({ status: 413, code: "too_large" });
    expect(sshWasUsed()).toBe(false);
  });

  it("creates folders, renames and deletes, each with an audit entry", async () => {
    expect((await mkdir(post("mkdir", { path: "shared/uploads" }), ctxFor(projectId))).status).toBe(201);
    expect((await rename(post("rename", { from: "shared/uploads", to: "shared/files" }), ctxFor(projectId))).status).toBe(200);
    expect((await remove(post("delete", { path: "shared/files", recursive: true }), ctxFor(projectId))).status).toBe(200);

    const rows = await auditRows();
    const by = (a: string) => rows.filter((r) => r.action === a).map((r) => JSON.parse(r.meta!));
    expect(by("file.mkdir")).toContainEqual({ path: "shared/uploads" });
    expect(by("file.rename")).toContainEqual({ from: "shared/uploads", to: "shared/files" });
    expect(by("file.delete")).toContainEqual({ path: "shared/files" });
    for (const r of rows) expect(r.target).toBe(projectId);

    const del = calls.filter((c) => c.command.includes("rm -rf")).at(-1)!;
    expect(del.command.endsWith("'shared/files' '1'")).toBe(true);
  });

  it("does not audit a failed write or delete", async () => {
    const before = (await auditRows()).length;
    reply = () => ({ code: 30 });
    expect((await remove(post("delete", { path: "shared/ghost" }), ctxFor(projectId))).status).toBe(404);
    expect((await rename(post("rename", { from: "shared/ghost", to: "shared/b" }), ctxFor(projectId))).status).toBe(404);
    expect((await auditRows()).length).toBe(before);
  });
});

describe("failures from the container", () => {
  it("turns an unreachable container into a plain 502, not a 500", async () => {
    vi.mocked(withServerSession).mockRejectedValue(
      new SshError("Could not reach the Nest SSH host (ECONNREFUSED).", "network")
    );
    const res = await list(get("list", { path: "" }), ctxFor(projectId));
    expect(await errorOf(res)).toMatchObject({ status: 502, code: "ssh_network" });
    const res2 = await write(upload({ path: "shared/a.txt" }, "x"), ctxFor(projectId));
    expect(res2.status).toBe(502);
  });

  it("does not leak stderr from the container", async () => {
    reply = () => ({ code: 77, stderr: "/home/sam/secret/path: boom" });
    const e = await errorOf(await list(get("list", { path: "shared" }), ctxFor(projectId)));
    expect(e).toMatchObject({ status: 502, code: "upstream" });
    expect(e.message).not.toContain("boom");
  });

  it("maps a missing project folder to 404", async () => {
    reply = () => ({ code: 10 });
    expect(await errorOf(await list(get("list", { path: "" }), ctxFor(projectId)))).toMatchObject({
      status: 404,
      code: "no_folder",
    });
  });
});
