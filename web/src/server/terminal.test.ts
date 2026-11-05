import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/server/http";
import {
  checkSize,
  describeIdentity,
  isSessionId,
  TERMINAL_LIMITS,
  TerminalManager,
  type CloseReason,
} from "@/server/terminal";
import type { ShellCloseReason, ShellHandle } from "@/server/ssh/shell";

/** A shell that records what it is given and lets the test push output and close it. */
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

const ALICE = "user-alice";
const BOB = "user-bob";
const SIZE = { cols: 80, rows: 24 };

function setup(owners: Record<string, string[]> = { [ALICE]: ["p1", "p2"], [BOB]: ["p3"] }) {
  const shells: FakeShell[] = [];
  const audits: { userId: string | null; action: string; target?: string | null; meta?: unknown }[] = [];
  let n = 0;
  const manager = new TerminalManager({
    // Same clock as the fake timers.
    now: () => Date.now(),
    newId: () => `id${String(++n).padStart(20, "0")}`,
    getProject: async (userId, projectId) => {
      if (!owners[userId]?.includes(projectId)) throw new HttpError(404, "Project not found", "not_found");
      return { id: projectId, serverId: "s1", slug: projectId };
    },
    connect: async () => {
      const shell = new FakeShell();
      shells.push(shell);
      return { shell, uid: 0, host: "demo.hackclub.app" };
    },
    audit: async (userId, action, target, meta) => {
      audits.push({ userId, action, target, meta });
    },
  });
  return { manager, shells, audits };
}

async function status(fn: () => unknown): Promise<number | "ok"> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    return e instanceof HttpError ? e.status : -1;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("opening", () => {
  it("opens a session for the project's owner and logs terminal.open without input or output", async () => {
    const { manager, audits } = setup();
    const info = await manager.open(ALICE, "p1", SIZE);
    expect(info.identity).toBe("root");
    expect(info.banner).toContain("root");
    expect(info.expiresAt - info.openedAt).toBe(TERMINAL_LIMITS.idleMs);
    await Promise.resolve();
    expect(audits).toEqual([
      { userId: ALICE, action: "terminal.open", target: "p1", meta: { project: "p1" } },
    ]);
  });

  it("refuses a project the user does not own with a 404, and opens no shell", async () => {
    const { manager, shells } = setup();
    expect(await status(() => manager.open(BOB, "p1", SIZE))).toBe(404);
    expect(await status(() => manager.open(ALICE, "does-not-exist", SIZE))).toBe(404);
    expect(shells).toHaveLength(0);
  });

  it("allows one open session per user per project, but not a second", async () => {
    const { manager } = setup();
    await manager.open(ALICE, "p1", SIZE);
    expect(await status(() => manager.open(ALICE, "p1", SIZE))).toBe(409);
    // Another project and another user are separate.
    expect(await status(() => manager.open(ALICE, "p2", SIZE))).toBe("ok");
    expect(await status(() => manager.open(BOB, "p3", SIZE))).toBe("ok");
    expect(manager.size).toBe(3);
  });

  it("blocks a second open while the first is still connecting", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const manager = new TerminalManager({
      getProject: async (_u, id) => ({ id, serverId: "s", slug: id }),
      connect: async () => {
        await gate;
        return { shell: new FakeShell(), uid: 1000, host: "h" };
      },
      audit: async () => {},
    });
    const first = manager.open(ALICE, "p1", SIZE);
    await Promise.resolve();
    await Promise.resolve();
    expect(await status(() => manager.open(ALICE, "p1", SIZE))).toBe(409);
    release();
    await first;
    expect(manager.size).toBe(1);
  });

  it("frees the slot when connecting fails", async () => {
    let fail = true;
    const manager = new TerminalManager({
      getProject: async (_u, id) => ({ id, serverId: "s", slug: id }),
      connect: async () => {
        if (fail) throw new HttpError(502, "unreachable", "upstream");
        return { shell: new FakeShell(), uid: null, host: "h" };
      },
      audit: async () => {},
    });
    expect(await status(() => manager.open(ALICE, "p1", SIZE))).toBe(502);
    fail = false;
    expect(await status(() => manager.open(ALICE, "p1", SIZE))).toBe("ok");
  });

  it("caps the number of sessions on the server", async () => {
    const owners = { [ALICE]: Array.from({ length: TERMINAL_LIMITS.maxSessions + 1 }, (_, i) => `p${i}`) };
    const { manager } = setup(owners);
    for (let i = 0; i < TERMINAL_LIMITS.maxSessions; i++) await manager.open(ALICE, `p${i}`, SIZE);
    expect(await status(() => manager.open(ALICE, `p${TERMINAL_LIMITS.maxSessions}`, SIZE))).toBe(503);
  });
});

describe("limits", () => {
  it("closes after 10 minutes without input, closes the shell and logs the reason", async () => {
    const { manager, shells, audits } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const reasons: CloseReason[] = [];
    manager.subscribe(ALICE, "p1", sessionId, { onData: () => {}, onEnd: (r) => reasons.push(r) });

    await vi.advanceTimersByTimeAsync(TERMINAL_LIMITS.idleMs - 1);
    expect(manager.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(manager.size).toBe(0);
    expect(shells[0].closed).toBe(1);
    expect(reasons).toEqual(["idle"]);
    expect(audits.at(-1)).toMatchObject({
      action: "terminal.close",
      target: "p1",
      meta: { project: "p1", reason: "idle" },
    });
    // The user can open a new one afterwards.
    expect(await status(() => manager.open(ALICE, "p1", SIZE))).toBe("ok");
  });

  it("input restarts the idle timer", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    await vi.advanceTimersByTimeAsync(TERMINAL_LIMITS.idleMs - 1000);
    const after = manager.write(ALICE, "p1", sessionId, "ls\n");
    expect(after.expiresAt - Date.now()).toBe(TERMINAL_LIMITS.idleMs);
    await vi.advanceTimersByTimeAsync(TERMINAL_LIMITS.idleMs - 1000);
    expect(manager.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.size).toBe(0);
  });

  it("ends at 60 minutes in total even while the user keeps typing", async () => {
    const { manager, audits } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const step = 5 * 60_000;
    for (let t = 0; t < TERMINAL_LIMITS.maxAgeMs - step; t += step) {
      await vi.advanceTimersByTimeAsync(step);
      manager.write(ALICE, "p1", sessionId, "x");
    }
    expect(manager.size).toBe(1);
    // The last input moved the idle deadline past the total limit; the info says so.
    expect(manager.info(ALICE, "p1", sessionId).expiresAt - Date.now()).toBe(step);
    await vi.advanceTimersByTimeAsync(step);
    expect(manager.size).toBe(0);
    expect(audits.at(-1)).toMatchObject({ meta: { reason: "limit" } });
  });

  it("resize does not count as activity", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    await vi.advanceTimersByTimeAsync(TERMINAL_LIMITS.idleMs - 1000);
    manager.resize(ALICE, "p1", sessionId, { cols: 100, rows: 30 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.size).toBe(0);
  });
});

describe("lifecycle", () => {
  it("removes the session when the SSH connection drops", async () => {
    const { manager, shells, audits } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const reasons: CloseReason[] = [];
    manager.subscribe(ALICE, "p1", sessionId, { onData: () => {}, onEnd: (r) => reasons.push(r) });
    shells[0].drop("connection-lost");
    expect(manager.size).toBe(0);
    expect(reasons).toEqual(["connection-lost"]);
    expect(audits.at(-1)).toMatchObject({ meta: { reason: "connection-lost" } });
    expect(await status(() => manager.write(ALICE, "p1", sessionId, "x"))).toBe(404);
  });

  it("removes the session when the shell exits", async () => {
    const { manager, shells } = setup();
    await manager.open(ALICE, "p1", SIZE);
    shells[0].drop("exit");
    expect(manager.size).toBe(0);
  });

  it("close() ends the shell once, logs it once, and a second close is a 404", async () => {
    const { manager, shells, audits } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    manager.close(ALICE, "p1", sessionId);
    expect(shells[0].closed).toBe(1);
    expect(audits.filter((a) => a.action === "terminal.close")).toHaveLength(1);
    expect(await status(() => manager.close(ALICE, "p1", sessionId))).toBe(404);
  });

  it("tells a late subscriber why the session ended, only to its owner", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    manager.close(ALICE, "p1", sessionId);
    const sub = { onData: () => {}, onEnd: () => {} };
    expect(manager.subscribe(ALICE, "p1", sessionId, sub)).toEqual({ ended: "closed" });
    expect(await status(() => manager.subscribe(BOB, "p1", sessionId, sub))).toBe(404);
    await vi.advanceTimersByTimeAsync(TERMINAL_LIMITS.closedMemoryMs + 1);
    expect(await status(() => manager.subscribe(ALICE, "p1", sessionId, sub))).toBe(404);
  });

  it("never writes input or output to the audit log", async () => {
    const { manager, shells, audits } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    manager.write(ALICE, "p1", sessionId, "echo SECRET-INPUT\n");
    shells[0].emit("SECRET-OUTPUT");
    manager.close(ALICE, "p1", sessionId);
    await Promise.resolve();
    const logged = JSON.stringify(audits);
    expect(logged).not.toContain("SECRET");
    expect(audits.map((a) => a.action)).toEqual(["terminal.open", "terminal.close"]);
  });
});

describe("ownership", () => {
  it("answers 404 to another user for every call, as if the session did not exist", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const sub = { onData: () => {}, onEnd: () => {} };
    expect(await status(() => manager.info(BOB, "p1", sessionId))).toBe(404);
    expect(await status(() => manager.write(BOB, "p1", sessionId, "x"))).toBe(404);
    expect(await status(() => manager.resize(BOB, "p1", sessionId, SIZE))).toBe(404);
    expect(await status(() => manager.subscribe(BOB, "p1", sessionId, sub))).toBe(404);
    expect(await status(() => manager.close(BOB, "p1", sessionId))).toBe(404);
    // Same answer as an id that never existed.
    expect(await status(() => manager.write(BOB, "p1", "nope", "x"))).toBe(404);
    // And the owner's session is untouched.
    expect(manager.size).toBe(1);
    expect(manager.active(BOB, "p1")).toBeNull();
  });

  it("does not let a session be used through a different project id", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    expect(await status(() => manager.write(ALICE, "p2", sessionId, "x"))).toBe(404);
  });
});

describe("output buffer", () => {
  it("keeps only the newest 64 KB and replays it to a new subscriber", async () => {
    const { manager, shells } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const cap = TERMINAL_LIMITS.bufferBytes;
    shells[0].emit(Buffer.alloc(cap, "a"));
    shells[0].emit(Buffer.alloc(1000, "b"));
    const sub = manager.subscribe(ALICE, "p1", sessionId, { onData: () => {}, onEnd: () => {} });
    if (!("replay" in sub)) throw new Error("expected a replay");
    expect(sub.replay.length).toBe(cap);
    expect(sub.replay.subarray(cap - 1000).equals(Buffer.alloc(1000, "b"))).toBe(true);
    expect(sub.replay[0]).toBe("a".charCodeAt(0));
  });

  it("cuts a single oversized chunk to its tail", async () => {
    const { manager, shells } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const big = Buffer.concat([Buffer.alloc(10, "x"), Buffer.alloc(TERMINAL_LIMITS.bufferBytes, "y")]);
    shells[0].emit(big);
    const sub = manager.subscribe(ALICE, "p1", sessionId, { onData: () => {}, onEnd: () => {} });
    if (!("replay" in sub)) throw new Error("expected a replay");
    expect(sub.replay.length).toBe(TERMINAL_LIMITS.bufferBytes);
    expect(sub.replay.every((b) => b === "y".charCodeAt(0))).toBe(true);
  });

  it("sends live output to subscribers until they unsubscribe", async () => {
    const { manager, shells } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    const seen: string[] = [];
    const sub = manager.subscribe(ALICE, "p1", sessionId, {
      onData: (c) => seen.push(c.toString()),
      onEnd: () => {},
    });
    shells[0].emit("one");
    if ("unsubscribe" in sub) sub.unsubscribe();
    shells[0].emit("two");
    expect(seen).toEqual(["one"]);
  });
});

describe("input and resize", () => {
  it("passes input to the shell and rejects more than 8 KB or nothing", async () => {
    const { manager, shells } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    manager.write(ALICE, "p1", sessionId, "pwd\n");
    expect(shells[0].written).toEqual(["pwd\n"]);
    expect(await status(() => manager.write(ALICE, "p1", sessionId, "x".repeat(TERMINAL_LIMITS.inputBytes)))).toBe("ok");
    expect(await status(() => manager.write(ALICE, "p1", sessionId, "x".repeat(TERMINAL_LIMITS.inputBytes + 1)))).toBe(413);
    // Bytes, not characters: 3-byte characters hit the cap sooner.
    expect(await status(() => manager.write(ALICE, "p1", sessionId, "€".repeat(2800)))).toBe(413);
    expect(await status(() => manager.write(ALICE, "p1", sessionId, ""))).toBe(400);
  });

  it("accepts sizes inside 20-400 columns and 5-200 rows and refuses the rest", async () => {
    const { manager, shells } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    for (const size of [
      { cols: 20, rows: 5 },
      { cols: 400, rows: 200 },
      { cols: 120, rows: 40 },
    ]) {
      expect(await status(() => manager.resize(ALICE, "p1", sessionId, size))).toBe("ok");
    }
    for (const size of [
      { cols: 19, rows: 24 },
      { cols: 401, rows: 24 },
      { cols: 80, rows: 4 },
      { cols: 80, rows: 201 },
      { cols: 80.5, rows: 24 },
      { cols: Number.NaN, rows: 24 },
    ]) {
      expect(await status(() => manager.resize(ALICE, "p1", sessionId, size))).toBe(400);
    }
    expect(shells[0].sizes).toEqual([
      { cols: 20, rows: 5 },
      { cols: 400, rows: 200 },
      { cols: 120, rows: 40 },
    ]);
  });

  it("checks the size when opening too", async () => {
    const { manager, shells } = setup();
    expect(await status(() => manager.open(ALICE, "p1", { cols: 5, rows: 5 }))).toBe(400);
    expect(shells).toHaveLength(0);
    expect(checkSize({ cols: 80, rows: 24 })).toEqual({ cols: 80, rows: 24 });
  });
});

describe("identity banner", () => {
  it("shows the real uid when known and a plain sentence when not", () => {
    expect(describeIdentity(0, "a.hackclub.app")).toMatchObject({ identity: "root" });
    expect(describeIdentity(1000, "a.hackclub.app")).toMatchObject({
      identity: "uid 1000",
      banner: expect.stringContaining("uid 1000"),
    });
    expect(describeIdentity(null, "a.hackclub.app")).toMatchObject({
      identity: null,
      banner: expect.stringContaining("as the user Nest gives this container"),
    });
  });

  it("recognises the session ids it makes", async () => {
    const real = new TerminalManager({
      getProject: async (_u, id) => ({ id, serverId: "s", slug: id }),
      connect: async () => ({ shell: new FakeShell(), uid: 0, host: "h" }),
      audit: async () => {},
    });
    const { sessionId } = await real.open(ALICE, "p1", SIZE);
    expect(isSessionId(sessionId)).toBe(true);
    expect(sessionId).toHaveLength(22); // 128 bits, base64url
    expect(isSessionId("short")).toBe(false);
    expect(isSessionId("../etc/passwd")).toBe(false);
  });
});

describe("closeAllForUser", () => {
  it("closes every terminal of one user, logs terminal.close with the reason, and leaves others alone", async () => {
    const { manager, shells, audits } = setup();
    await manager.open(ALICE, "p1", SIZE);
    await manager.open(ALICE, "p2", SIZE);
    await manager.open(BOB, "p3", SIZE);

    const closed = await manager.closeAllForUser(ALICE, "signed-out");

    expect(closed).toBe(2);
    expect(manager.size).toBe(1);
    expect(shells.map((s) => s.closed)).toEqual([1, 1, 0]);
    expect(manager.active(ALICE, "p1")).toBeNull();
    expect(manager.active(BOB, "p3")).not.toBeNull();
    const closes = audits.filter((a) => a.action === "terminal.close");
    expect(closes).toHaveLength(2);
    expect(closes.every((a) => a.userId === ALICE && (a.meta as { reason: string }).reason === "signed-out")).toBe(true);
  });

  it("tells a stream that reconnects why it ended", async () => {
    const { manager } = setup();
    const { sessionId } = await manager.open(ALICE, "p1", SIZE);
    await manager.closeAllForUser(ALICE, "signed-out");
    const sub = manager.subscribe(ALICE, "p1", sessionId, { onData() {}, onEnd() {} });
    expect(sub).toEqual({ ended: "signed-out" satisfies CloseReason });
  });

  it("can be limited to one server", async () => {
    const shells: FakeShell[] = [];
    const manager = new TerminalManager({
      getProject: async (_u, id) => ({ id, serverId: id === "p1" ? "s1" : "s2", slug: id }),
      connect: async () => {
        const shell = new FakeShell();
        shells.push(shell);
        return { shell, uid: 0, host: "h" };
      },
      audit: async () => {},
    });
    await manager.open(ALICE, "p1", SIZE);
    await manager.open(ALICE, "p2", SIZE);
    expect(await manager.closeAllForUser(ALICE, "disabled", { serverId: "s1" })).toBe(1);
    expect(shells.map((s) => s.closed)).toEqual([1, 0]);
    expect(manager.active(ALICE, "p2")).not.toBeNull();
  });

  it("does nothing for a user with no terminals", async () => {
    const { manager, audits } = setup();
    expect(await manager.closeAllForUser(ALICE, "signed-out")).toBe(0);
    expect(audits).toEqual([]);
  });

  it("does not let a terminal that was still connecting outlive the sign-out", async () => {
    const shell = new FakeShell();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const manager = new TerminalManager({
      getProject: async (_u, id) => ({ id, serverId: "s1", slug: id }),
      connect: async () => {
        await gate;
        return { shell, uid: 0, host: "h" };
      },
      audit: async () => {},
    });
    const outcome = manager.open(ALICE, "p1", SIZE).then(
      () => "opened",
      (e: unknown) => (e instanceof HttpError ? e.status : -1)
    );
    await Promise.resolve();
    await Promise.resolve();
    await manager.closeAllForUser(ALICE, "signed-out");
    release();
    expect(await outcome).toBe(403);
    expect(shell.closed).toBe(1);
    expect(manager.size).toBe(0);
    expect(manager.active(ALICE, "p1")).toBeNull();
  });
});
