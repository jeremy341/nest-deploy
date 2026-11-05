import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { HttpError } from "@/server/http";
import { TerminalManager } from "@/server/terminal";
import type { ShellHandle } from "@/server/ssh/shell";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/auth/current", () => ({
  getCurrentUser: async () => auth.user,
}));

import { GET as getActive, POST as openTerminal } from "@/app/api/projects/[id]/terminal/route";
import { DELETE as closeTerminal } from "@/app/api/projects/[id]/terminal/[sessionId]/route";
import { POST as sendInput } from "@/app/api/projects/[id]/terminal/[sessionId]/input/route";
import { POST as resizeTerminal } from "@/app/api/projects/[id]/terminal/[sessionId]/resize/route";
import { GET as streamOutput } from "@/app/api/projects/[id]/terminal/[sessionId]/stream/route";

class FakeShell implements ShellHandle {
  written: string[] = [];
  sizes: { cols: number; rows: number }[] = [];
  private data: ((c: Buffer) => void) | null = null;
  write(d: string) {
    this.written.push(d);
  }
  resize(cols: number, rows: number) {
    this.sizes.push({ cols, rows });
  }
  onData(cb: (c: Buffer) => void) {
    this.data = cb;
  }
  onClose() {}
  close() {}
  emit(t: string) {
    this.data?.(Buffer.from(t));
  }
}

const ALICE = { id: "user-alice" };
const BOB = { id: "user-bob" };
const ORIGIN = "http://localhost:3000";

let shells: FakeShell[];

beforeEach(() => {
  shells = [];
  const manager = new TerminalManager({
    getProject: async (userId, projectId) => {
      const owner = projectId === "p-alice" ? ALICE.id : BOB.id;
      if (userId !== owner) throw new HttpError(404, "Project not found", "not_found");
      return { id: projectId, serverId: "s", slug: "app" };
    },
    connect: async () => {
      const shell = new FakeShell();
      shells.push(shell);
      return { shell, uid: 0, host: "demo.hackclub.app" };
    },
    audit: async () => {},
  });
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("nest-deploy.terminal-manager")] = manager;
  auth.user = ALICE;
});

function req(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string, sessionId?: string) => ({
  params: Promise.resolve({ id, sessionId: sessionId ?? "" }),
});

async function openAsAlice() {
  const res = await openTerminal(
    req("/api/projects/p-alice/terminal", "POST", { cols: 90, rows: 30 }),
    ctx("p-alice")
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { sessionId: string; banner: string; identity: string };
}

describe("terminal routes", () => {
  it("opens a session and returns the id and banner", async () => {
    const s = await openAsAlice();
    expect(s.sessionId).toHaveLength(22);
    expect(s.banner).toContain("root");
    expect(s.identity).toBe("root");
  });

  it("requires sign-in on every route", async () => {
    const s = await openAsAlice();
    auth.user = null;
    const id = s.sessionId;
    const results = await Promise.all([
      openTerminal(req("/x", "POST", {}), ctx("p-alice")),
      getActive(req("/x", "GET"), ctx("p-alice")),
      sendInput(req("/x", "POST", { data: "ls" }), ctx("p-alice", id)),
      resizeTerminal(req("/x", "POST", { cols: 80, rows: 24 }), ctx("p-alice", id)),
      streamOutput(req("/x", "GET"), ctx("p-alice", id)),
      closeTerminal(req("/x", "DELETE"), ctx("p-alice", id)),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it("will not open a terminal on a project that belongs to someone else", async () => {
    auth.user = BOB;
    const res = await openTerminal(req("/x", "POST", {}), ctx("p-alice"));
    expect(res.status).toBe(404);
    expect(shells).toHaveLength(0);
  });

  it("answers 404 to another user for input, resize, stream and close, and leaves the session alone", async () => {
    const s = await openAsAlice();
    auth.user = BOB;
    // Bob guesses Alice's project id and session id.
    const bad = [
      await sendInput(req("/x", "POST", { data: "id\n" }), ctx("p-alice", s.sessionId)),
      await resizeTerminal(req("/x", "POST", { cols: 80, rows: 24 }), ctx("p-alice", s.sessionId)),
      await streamOutput(req("/x", "GET"), ctx("p-alice", s.sessionId)),
      await closeTerminal(req("/x", "DELETE"), ctx("p-alice", s.sessionId)),
      // ...or uses his own project id with her session id.
      await sendInput(req("/x", "POST", { data: "id\n" }), ctx("p-bob", s.sessionId)),
    ];
    expect(bad.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
    expect(shells[0].written).toEqual([]);
    expect(shells[0].sizes).toEqual([]);
    // Same answer as a session id that never existed, so existence is not revealed.
    const never = await sendInput(req("/x", "POST", { data: "id\n" }), ctx("p-alice", "A".repeat(22)));
    expect(never.status).toBe(404);
    expect(await never.json()).toEqual(await bad[0].json());
    // Bob cannot see Alice's open terminal through the status route either.
    const active = await getActive(req("/x", "GET"), ctx("p-alice"));
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ session: null });
    // And it still works for Alice.
    auth.user = ALICE;
    const ok = await sendInput(req("/x", "POST", { data: "pwd\n" }), ctx("p-alice", s.sessionId));
    expect(ok.status).toBe(200);
    expect(shells[0].written).toEqual(["pwd\n"]);
  });

  it("rejects input from another origin, even from the owner", async () => {
    const s = await openAsAlice();
    const res = await sendInput(
      req("/x", "POST", { data: "ls\n" }, { origin: "https://evil.example" }),
      ctx("p-alice", s.sessionId)
    );
    expect(res.status).toBe(403);
    expect(shells[0].written).toEqual([]);
    const del = await closeTerminal(
      req("/x", "DELETE", undefined, { origin: "https://evil.example" }),
      ctx("p-alice", s.sessionId)
    );
    expect(del.status).toBe(403);
  });

  it("caps input at 8 KB and validates it", async () => {
    const s = await openAsAlice();
    const big = await sendInput(req("/x", "POST", { data: "x".repeat(8193) }), ctx("p-alice", s.sessionId));
    expect(big.status).toBe(400);
    const huge = await sendInput(
      req("/x", "POST", { data: "x" }, { "content-length": String(1024 * 1024) }),
      ctx("p-alice", s.sessionId)
    );
    expect(huge.status).toBe(413);
    const multibyte = await sendInput(req("/x", "POST", { data: "€".repeat(2800) }), ctx("p-alice", s.sessionId));
    expect(multibyte.status).toBe(413);
    const empty = await sendInput(req("/x", "POST", { data: "" }), ctx("p-alice", s.sessionId));
    expect(empty.status).toBe(400);
    const fine = await sendInput(req("/x", "POST", { data: "x".repeat(8192) }), ctx("p-alice", s.sessionId));
    expect(fine.status).toBe(200);
  });

  it("resizes inside the bounds and refuses outside them", async () => {
    const s = await openAsAlice();
    const ok = await resizeTerminal(req("/x", "POST", { cols: 120, rows: 40 }), ctx("p-alice", s.sessionId));
    expect(ok.status).toBe(200);
    const bad = await resizeTerminal(req("/x", "POST", { cols: 5, rows: 40 }), ctx("p-alice", s.sessionId));
    expect(bad.status).toBe(400);
    expect(shells[0].sizes).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("opens only one terminal per project", async () => {
    await openAsAlice();
    const again = await openTerminal(req("/x", "POST", {}), ctx("p-alice"));
    expect(again.status).toBe(409);
    const active = await getActive(req("/x", "GET"), ctx("p-alice"));
    expect((await active.json()).session).not.toBeNull();
  });

  it("streams buffered then live output as SSE with no-store, and ends when the session closes", async () => {
    const s = await openAsAlice();
    shells[0].emit("hello ");
    const res = await streamOutput(req("/x", "GET"), ctx("p-alice", s.sessionId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-store");

    shells[0].emit("world");
    const del = await closeTerminal(req("/x", "DELETE"), ctx("p-alice", s.sessionId));
    expect(del.status).toBe(200);

    const text = await res.text(); // resolves because the stream ended
    expect(text).toContain("event: ready");
    expect(text).toContain(`event: out\ndata: ${Buffer.from("hello ").toString("base64")}`);
    expect(text).toContain(`event: out\ndata: ${Buffer.from("world").toString("base64")}`);
    expect(text).toContain('event: end\ndata: {"reason":"closed"}');
  });

  it("treats a malformed session id as not found without looking it up", async () => {
    const res = await sendInput(req("/x", "POST", { data: "x" }), ctx("p-alice", "../../etc/passwd"));
    expect(res.status).toBe(404);
  });

  it("closes with DELETE and then reports 404", async () => {
    const s = await openAsAlice();
    expect((await closeTerminal(req("/x", "DELETE"), ctx("p-alice", s.sessionId))).status).toBe(200);
    expect((await closeTerminal(req("/x", "DELETE"), ctx("p-alice", s.sessionId))).status).toBe(404);
  });
});
