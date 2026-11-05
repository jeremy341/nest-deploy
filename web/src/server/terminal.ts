import { randomBytes } from "node:crypto";
import { audit } from "@/server/audit";
import { projectDir } from "@/server/deploy/layout";
import { HttpError, notFound } from "@/server/http";
import { getProjectForUser } from "@/server/projects";
import { connectToServer, getServerForUser } from "@/server/servers";
import { SshError } from "@/server/ssh/connection";
import { probeSession } from "@/server/ssh/probe";
import type { ShellHandle } from "@/server/ssh/shell";

/**
 * Terminal sessions: an interactive shell on a user's container, held in this
 * process's memory and driven from the browser over HTTP (see
 * app/api/projects/[id]/terminal).
 *
 * This is a root shell in a browser, so everything here is conservative:
 * one session per user per project, a session id nobody can guess, server
 * enforced idle and total limits, an owner check on every call, and a log of
 * when a session opened and closed. Keystrokes and output are never logged.
 */

export const TERMINAL_LIMITS = {
  /** No input for this long ends the session. */
  idleMs: 10 * 60_000,
  /** A session never lives longer than this, active or not. */
  maxAgeMs: 60 * 60_000,
  /** Output kept per session so a page reload can pick up where it left off. */
  bufferBytes: 64 * 1024,
  /** One input request carries at most this many bytes. */
  inputBytes: 8 * 1024,
  minCols: 20,
  maxCols: 400,
  minRows: 5,
  maxRows: 200,
  /** Sessions open at once on the whole server. */
  maxSessions: 50,
  /** How long a closed session's reason is kept, so a stream that reconnects can still be told why. */
  closedMemoryMs: 2 * 60_000,
} as const;

export type CloseReason =
  | "closed" // the user pressed Close
  | "idle" // no input for idleMs
  | "limit" // maxAgeMs reached
  | "shell-exit" // the shell ended (the user typed exit)
  | "connection-lost" // the SSH connection dropped
  | "error";

export type TerminalSize = { cols: number; rows: number };

export type SessionInfo = {
  sessionId: string;
  banner: string;
  /** "root", "uid 1000", or null when it could not be read. */
  identity: string | null;
  host: string;
  openedAt: number;
  /** When the session ends if nothing more happens: the earlier of the idle and total limits. */
  expiresAt: number;
  idleMs: number;
  maxAgeMs: number;
  serverNow: number;
};

export type Subscriber = {
  onData: (chunk: Buffer) => void;
  onEnd: (reason: CloseReason) => void;
};

export type Subscription =
  | { ended: CloseReason }
  | { replay: Buffer; unsubscribe: () => void };

export type ConnectedShell = {
  shell: ShellHandle;
  /** uid of the shell's user, from the probe. */
  uid: number | null;
  host: string;
};

export type TerminalDeps = {
  now: () => number;
  newId: () => string;
  /** Must throw a 404 HttpError for a project the user does not own. */
  getProject: (userId: string, projectId: string) => Promise<{ id: string; serverId: string; slug: string }>;
  connect: (
    userId: string,
    project: { id: string; serverId: string; slug: string },
    size: TerminalSize
  ) => Promise<ConnectedShell>;
  audit: (
    userId: string | null,
    action: string,
    target?: string | null,
    meta?: Record<string, string | number | boolean | null>
  ) => Promise<void>;
};

type Session = {
  id: string;
  userId: string;
  projectId: string;
  shell: ShellHandle;
  banner: string;
  identity: string | null;
  host: string;
  openedAt: number;
  lastInputAt: number;
  chunks: Buffer[];
  bufferedBytes: number;
  subscribers: Set<Subscriber>;
  timer: NodeJS.Timeout | null;
  closed: boolean;
};

const SESSION_ID = /^[A-Za-z0-9_-]{22}$/;

/** True for a session id this module could have made. Anything else is a 404 without a lookup. */
export function isSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

export function describeIdentity(uid: number | null, host: string): { identity: string | null; banner: string } {
  if (uid === 0) {
    return { identity: "root", banner: `This shell runs as root on ${host}.` };
  }
  if (uid !== null && Number.isInteger(uid) && uid > 0) {
    return {
      identity: `uid ${uid}`,
      banner: `This shell runs as the container user (uid ${uid}) on ${host}.`,
    };
  }
  return {
    identity: null,
    banner: `This shell runs as the user Nest gives this container, on ${host}.`,
  };
}

/** Whole numbers inside the limits, or a 400. */
export function checkSize(size: TerminalSize): TerminalSize {
  const { cols, rows } = size;
  const L = TERMINAL_LIMITS;
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < L.minCols ||
    cols > L.maxCols ||
    rows < L.minRows ||
    rows > L.maxRows
  ) {
    throw new HttpError(
      400,
      `The terminal size must be ${L.minCols} to ${L.maxCols} columns and ${L.minRows} to ${L.maxRows} rows.`,
      "validation"
    );
  }
  return { cols, rows };
}

const sessionNotFound = () => notFound("Terminal session not found");

export class TerminalManager {
  private readonly deps: TerminalDeps;
  private readonly sessions = new Map<string, Session>();
  /** `${userId}:${projectId}` -> session id, for the one-per-project rule. */
  private readonly byProject = new Map<string, string>();
  /** Keys whose session is still being opened (connecting), so a second click cannot start another. */
  private readonly opening = new Set<string>();
  private readonly closedMemory = new Map<string, { userId: string; projectId: string; reason: CloseReason; until: number }>();

  constructor(deps: Partial<TerminalDeps> = {}) {
    this.deps = {
      now: () => Date.now(),
      newId: () => randomBytes(16).toString("base64url"),
      getProject: getProjectForUser,
      connect: connectToContainer,
      audit,
      ...deps,
    };
  }

  /** Open a shell for the project's owner. Fails with 404 for anyone else and 409 if one is already open. */
  async open(userId: string, projectId: string, size: TerminalSize): Promise<SessionInfo> {
    const checked = checkSize(size);
    // Ownership first: the same 404 whether the project is missing or someone else's.
    const project = await this.deps.getProject(userId, projectId);

    const key = `${userId}:${project.id}`;
    if (this.byProject.has(key) || this.opening.has(key)) {
      throw new HttpError(
        409,
        "A terminal is already open for this project. Resume or close it first.",
        "conflict"
      );
    }
    if (this.sessions.size + this.opening.size >= TERMINAL_LIMITS.maxSessions) {
      throw new HttpError(503, "Too many terminals are open right now. Try again soon.", "busy");
    }

    this.opening.add(key);
    try {
      const { shell, uid, host } = await this.deps.connect(userId, project, checked);
      const { identity, banner } = describeIdentity(uid, host);
      const now = this.deps.now();
      const session: Session = {
        id: this.deps.newId(),
        userId,
        projectId: project.id,
        shell,
        banner,
        identity,
        host,
        openedAt: now,
        lastInputAt: now,
        chunks: [],
        bufferedBytes: 0,
        subscribers: new Set(),
        timer: null,
        closed: false,
      };
      this.sessions.set(session.id, session);
      this.byProject.set(key, session.id);

      // Logged before the shell can report a close, so the log reads open, then close.
      void this.deps.audit(userId, "terminal.open", project.id, { project: project.id });

      shell.onData((chunk) => this.receive(session, chunk));
      shell.onClose((reason) =>
        this.end(
          session,
          reason === "exit" ? "shell-exit" : reason === "connection-lost" ? "connection-lost" : "error"
        )
      );
      this.schedule(session);
      return this.describe(session);
    } finally {
      this.opening.delete(key);
    }
  }

  /** The open session for this user and project, if any. Used to offer Resume. */
  active(userId: string, projectId: string): SessionInfo | null {
    const id = this.byProject.get(`${userId}:${projectId}`);
    const session = id ? this.sessions.get(id) : undefined;
    return session ? this.describe(session) : null;
  }

  /** Session details for its owner. 404 for anyone else. */
  info(userId: string, projectId: string, sessionId: string): SessionInfo {
    return this.describe(this.owned(userId, projectId, sessionId));
  }

  /** Send keystrokes. Counts as activity, so it moves the idle deadline. */
  write(userId: string, projectId: string, sessionId: string, data: string): SessionInfo {
    const session = this.owned(userId, projectId, sessionId);
    if (typeof data !== "string" || data.length === 0) {
      throw new HttpError(400, "Nothing to send.", "validation");
    }
    if (Buffer.byteLength(data, "utf8") > TERMINAL_LIMITS.inputBytes) {
      throw new HttpError(
        413,
        `Send at most ${TERMINAL_LIMITS.inputBytes} bytes at a time.`,
        "too_large"
      );
    }
    session.lastInputAt = this.deps.now();
    this.schedule(session);
    session.shell.write(data);
    return this.describe(session);
  }

  /** Change the terminal size. Not activity: reflowing the window must not keep a session alive. */
  resize(userId: string, projectId: string, sessionId: string, size: TerminalSize): void {
    const session = this.owned(userId, projectId, sessionId);
    const { cols, rows } = checkSize(size);
    session.shell.resize(cols, rows);
  }

  /** Close the session now. */
  close(userId: string, projectId: string, sessionId: string): void {
    this.end(this.owned(userId, projectId, sessionId), "closed");
  }

  /**
   * Listen to a session's output. The reply starts with the buffered tail so a
   * reload resumes, then everything after it. A session that already ended
   * answers with its reason for a short while.
   */
  subscribe(userId: string, projectId: string, sessionId: string, sub: Subscriber): Subscription {
    this.forgetOld();
    const gone = this.closedMemory.get(sessionId);
    if (gone && gone.userId === userId && gone.projectId === projectId && !this.sessions.has(sessionId)) {
      return { ended: gone.reason };
    }
    const session = this.owned(userId, projectId, sessionId);
    session.subscribers.add(sub);
    return {
      replay: Buffer.concat(session.chunks),
      unsubscribe: () => {
        session.subscribers.delete(sub);
      },
    };
  }

  /** Number of open sessions. For tests and diagnostics. */
  get size(): number {
    return this.sessions.size;
  }

  /** Close everything. For process shutdown and tests. */
  closeAll(): void {
    for (const s of [...this.sessions.values()]) this.end(s, "closed");
  }

  // ---------------------------------------------------------------------

  /** The session if it exists and belongs to this user and project. The same 404 for every other case. */
  private owned(userId: string, projectId: string, sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.projectId !== projectId || session.closed) {
      throw sessionNotFound();
    }
    return session;
  }

  private describe(s: Session): SessionInfo {
    return {
      sessionId: s.id,
      banner: s.banner,
      identity: s.identity,
      host: s.host,
      openedAt: s.openedAt,
      expiresAt: this.deadline(s),
      idleMs: TERMINAL_LIMITS.idleMs,
      maxAgeMs: TERMINAL_LIMITS.maxAgeMs,
      serverNow: this.deps.now(),
    };
  }

  private deadline(s: Session): number {
    return Math.min(s.openedAt + TERMINAL_LIMITS.maxAgeMs, s.lastInputAt + TERMINAL_LIMITS.idleMs);
  }

  private receive(s: Session, chunk: Buffer) {
    if (s.closed) return;
    // Keep only the newest bufferBytes. A chunk bigger than the cap is cut to its tail.
    const cap = TERMINAL_LIMITS.bufferBytes;
    const piece = chunk.length > cap ? chunk.subarray(chunk.length - cap) : chunk;
    s.chunks.push(piece);
    s.bufferedBytes += piece.length;
    while (s.bufferedBytes > cap && s.chunks.length > 0) {
      const over = s.bufferedBytes - cap;
      const first = s.chunks[0];
      if (first.length <= over) {
        s.chunks.shift();
        s.bufferedBytes -= first.length;
      } else {
        s.chunks[0] = first.subarray(over);
        s.bufferedBytes -= over;
      }
    }
    for (const sub of [...s.subscribers]) {
      try {
        sub.onData(piece);
      } catch {
        s.subscribers.delete(sub);
      }
    }
  }

  /** (Re)arm the single timer that fires at the nearer of the two deadlines. */
  private schedule(s: Session) {
    if (s.closed) return;
    if (s.timer) clearTimeout(s.timer);
    const delay = Math.max(0, this.deadline(s) - this.deps.now());
    s.timer = setTimeout(() => this.check(s), delay);
    s.timer.unref?.();
  }

  private check(s: Session) {
    if (s.closed) return;
    const now = this.deps.now();
    if (now >= s.openedAt + TERMINAL_LIMITS.maxAgeMs) this.end(s, "limit");
    else if (now >= s.lastInputAt + TERMINAL_LIMITS.idleMs) this.end(s, "idle");
    else this.schedule(s);
  }

  /** The one place a session ends. Safe to call twice. */
  private end(s: Session, reason: CloseReason) {
    if (s.closed) return;
    s.closed = true;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    this.sessions.delete(s.id);
    const key = `${s.userId}:${s.projectId}`;
    if (this.byProject.get(key) === s.id) this.byProject.delete(key);

    this.forgetOld();
    this.closedMemory.set(s.id, {
      userId: s.userId,
      projectId: s.projectId,
      reason,
      until: this.deps.now() + TERMINAL_LIMITS.closedMemoryMs,
    });

    try {
      s.shell.close();
    } catch {
      // The shell is already gone.
    }
    for (const sub of [...s.subscribers]) {
      try {
        sub.onEnd(reason);
      } catch {
        // A broken stream must not stop the others.
      }
    }
    s.subscribers.clear();
    s.chunks = [];
    s.bufferedBytes = 0;

    void this.deps.audit(s.userId, "terminal.close", s.projectId, {
      project: s.projectId,
      reason,
      seconds: Math.round((this.deps.now() - s.openedAt) / 1000),
    });
  }

  private forgetOld() {
    const now = this.deps.now();
    for (const [id, g] of this.closedMemory) {
      if (g.until <= now) this.closedMemory.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Real container connection

function toHttp(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof SshError) {
    return new HttpError(502, `Could not open a terminal: ${err.message}`, "upstream");
  }
  return new HttpError(502, "Could not open a terminal on your container.", "upstream");
}

async function connectToContainer(
  userId: string,
  project: { id: string; serverId: string; slug: string },
  size: TerminalSize
): Promise<ConnectedShell> {
  const server = await getServerForUser(userId, project.serverId);
  // A root shell must only ever reach the machine whose key we recorded.
  if (!server.hostKeyFingerprint) {
    throw new HttpError(
      409,
      "This server has not been verified yet. Run Test connection on the Connect page first.",
      "conflict"
    );
  }
  const host = `${server.nestUsername}.hackclub.app`;

  let session;
  try {
    session = await connectToServer(server);
  } catch (err) {
    throw toHttp(err);
  }
  try {
    const probe = await probeSession(session);
    const shell = await session.openShell({
      cols: size.cols,
      rows: size.rows,
      cwd: projectDir(probe.home, project.slug),
    });
    const ssh = session;
    // This connection exists only for this terminal: closing either closes both.
    const wrapped: ShellHandle = {
      write: (d) => shell.write(d),
      resize: (c, r) => shell.resize(c, r),
      onData: (cb) => shell.onData(cb),
      onClose: (cb) =>
        shell.onClose((reason) => {
          ssh.close();
          cb(reason);
        }),
      close: () => {
        shell.close();
        ssh.close();
      },
    };
    return { shell: wrapped, uid: probe.uid, host };
  } catch (err) {
    session.close();
    throw toHttp(err);
  }
}

// ---------------------------------------------------------------------------
// The shared instance

const KEY = Symbol.for("nest-deploy.terminal-manager");

/**
 * One manager per process. It is kept on globalThis so route modules that are
 * bundled separately (and dev-server reloads) all see the same sessions.
 */
export function terminals(): TerminalManager {
  const g = globalThis as unknown as Record<symbol, TerminalManager | undefined>;
  return (g[KEY] ??= new TerminalManager());
}
