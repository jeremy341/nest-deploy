import type { Client, ClientChannel } from "ssh2";
import { isValidSlug } from "@/server/deploy/layout";

/**
 * Interactive shell on an SSH connection. This file only knows about the
 * channel: who may open one, for how long and what is logged is decided in
 * server/terminal.ts.
 */

export type ShellCloseReason = "exit" | "connection-lost" | "error";

export type ShellOptions = {
  cols: number;
  rows: number;
  /** Absolute folder the shell starts in. Checked by assertShellDir. */
  cwd: string;
};

/** What the session manager gets back. Output is raw bytes: UTF-8 can split between chunks. */
export type ShellHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Called for every chunk of output. Output that arrived before the first call is delivered then. */
  onData(cb: (chunk: Buffer) => void): void;
  /** Called once, when the shell ends, the channel fails or the SSH connection drops. */
  onClose(cb: (reason: ShellCloseReason) => void): void;
  /** Ends the shell. Safe to call more than once. */
  close(): void;
};

/** Give up if the server never answers the shell request. */
const SHELL_OPEN_TIMEOUT_MS = 15_000;

// Same shapes deploy/layout.ts produces: <home>/.nest-deploy/<slug>.
const SAFE_DIR = /^\/[A-Za-z0-9._/-]+$/;

/**
 * Accepts only a project folder as deploy/layout.ts builds it: absolute, plain
 * characters (so nothing can break out of the quoting below), no "." or ".."
 * segments, and ending in /.nest-deploy/<valid slug>.
 */
export function assertShellDir(dir: string): string {
  if (!SAFE_DIR.test(dir) || dir.includes("//")) {
    throw new Error("Invalid project folder");
  }
  const parts = dir.split("/");
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error("Invalid project folder");
  }
  const slug = parts[parts.length - 1];
  const marker = parts[parts.length - 2];
  if (marker !== ".nest-deploy" || !isValidSlug(slug)) {
    throw new Error("Invalid project folder");
  }
  return dir;
}

/**
 * First line typed into the new shell. The leading space keeps it out of bash
 * history. If the folder does not exist yet (nothing deployed), say so.
 */
export function startupCommand(cwd: string): string {
  const dir = assertShellDir(cwd);
  return (
    ` if cd -- '${dir}' 2>/dev/null; then clear; ` +
    `else echo 'The project folder does not exist yet. Deploy once to create it.'; fi\n`
  );
}

export function openShellOnClient(client: Client, opts: ShellOptions): Promise<ShellHandle> {
  const startup = startupCommand(opts.cwd);
  return new Promise<ShellHandle>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out waiting for the shell"));
    }, SHELL_OPEN_TIMEOUT_MS);

    client.shell(
      { term: "xterm-256color", cols: opts.cols, rows: opts.rows },
      (err, stream) => {
        clearTimeout(timer);
        if (err || !stream) {
          if (!settled) {
            settled = true;
            reject(err ?? new Error("The server did not open a shell"));
          }
          return;
        }
        if (settled) {
          // Timed out first: do not leave a shell nobody holds.
          stream.close();
          return;
        }
        settled = true;
        resolve(wrapChannel(client, stream, startup));
      }
    );
  });
}

function wrapChannel(client: Client, stream: ClientChannel, startup: string): ShellHandle {
  let closed = false;
  let dataCb: ((chunk: Buffer) => void) | null = null;
  let closeCb: ((reason: ShellCloseReason) => void) | null = null;
  let early: Buffer[] = [];
  let pendingReason: ShellCloseReason | null = null;

  const emit = (chunk: Buffer) => {
    if (dataCb) dataCb(chunk);
    else early.push(chunk);
  };

  const finish = (reason: ShellCloseReason) => {
    if (closed) return;
    closed = true;
    client.removeListener("close", onClientClose);
    if (closeCb) closeCb(reason);
    else pendingReason = reason;
  };
  const onClientClose = () => finish("connection-lost");

  stream.on("data", emit);
  stream.stderr?.on("data", emit);
  stream.on("close", () => finish("exit"));
  stream.on("error", () => finish("error"));
  client.once("close", onClientClose);

  stream.write(startup);

  return {
    write(data) {
      if (!closed) stream.write(data);
    },
    resize(cols, rows) {
      if (!closed) stream.setWindow(rows, cols, 0, 0);
    },
    onData(cb) {
      dataCb = cb;
      const queued = early;
      early = [];
      for (const chunk of queued) cb(chunk);
    },
    onClose(cb) {
      closeCb = cb;
      if (pendingReason) {
        const r = pendingReason;
        pendingReason = null;
        cb(r);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      client.removeListener("close", onClientClose);
      try {
        stream.end();
        stream.close();
      } catch {
        // Already gone.
      }
    },
  };
}
