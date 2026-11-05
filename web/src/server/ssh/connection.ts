import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { Client, type ConnectConfig } from "ssh2";
import { fingerprintOfBlob } from "@/server/ssh/keys";
import { openShellOnClient, type ShellHandle, type ShellOptions } from "@/server/ssh/shell";

export class SshError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "auth"
      | "network"
      | "host-key"
      | "timeout"
      | "exec"
      | "protocol",
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "SshError";
  }
}

export type ExecResult = { code: number; stdout: string; stderr: string };

export type ExecOptions = {
  /** Text written to the command's stdin. */
  stdin?: string | Buffer;
  /** Stream to pipe into stdin instead (for uploads). */
  stdinStream?: Readable;
  timeoutMs?: number;
  /** Called with each line of stdout/stderr as it arrives. */
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
};

export type ConnectOptions = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  /** SHA256:... of the host key we saw last time. Mismatch aborts. */
  pinnedHostKey?: string | null;
  readyTimeoutMs?: number;
};

export function friendlyConnectError(err: unknown): SshError {
  if (err instanceof SshError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("all configured authentication methods failed") ||
    lower.includes("authentication")
  ) {
    return new SshError(
      "Nest rejected the key. Check that you pasted the public key on the SSH Keys page of the Nest dashboard, and that the username is exactly your Nest username.",
      "auth",
      { cause: err }
    );
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return new SshError(
      "Timed out connecting to Nest. Your container may be stopped or starting; try again in a minute.",
      "timeout",
      { cause: err }
    );
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("ehostunreach") ||
    lower.includes("econnreset")
  ) {
    return new SshError(
      `Could not reach the Nest SSH host (${message}).`,
      "network",
      { cause: err }
    );
  }
  return new SshError(`SSH error: ${message}`, "protocol", { cause: err });
}

/** One live SSH connection to a Nest container (through the bastion). */
export class NestSession {
  private constructor(
    private readonly client: Client,
    readonly hostKeyFingerprint: string
  ) {}

  static async connect(opts: ConnectOptions): Promise<NestSession> {
    const client = new Client();
    let seenHostKey = "";

    const cfg: ConnectConfig = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      privateKey: opts.privateKey,
      readyTimeout: opts.readyTimeoutMs ?? 20000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 4,
      // Only ever offer the one key we were given.
      agent: undefined,
      tryKeyboard: false,
      hostVerifier: (key: Buffer) => {
        seenHostKey = fingerprintOfBlob(key);
        if (opts.pinnedHostKey && opts.pinnedHostKey !== seenHostKey) {
          return false;
        }
        return true;
      },
    };

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        client.removeListener("ready", onReady);
        if (opts.pinnedHostKey && seenHostKey && seenHostKey !== opts.pinnedHostKey) {
          reject(
            new SshError(
              `The host key of ${opts.host} changed (was ${opts.pinnedHostKey}, now ${seenHostKey}). Nothing was sent. If you expected this, reconnect the server.`,
              "host-key",
              { cause: err }
            )
          );
          return;
        }
        reject(friendlyConnectError(err));
      };
      const onReady = () => {
        client.removeListener("error", onError);
        resolve();
      };
      client.once("error", onError);
      client.once("ready", onReady);
      client.connect(cfg);
    });

    // Later errors (resets, keepalive failures) must not crash the process.
    client.on("error", () => {});

    return new NestSession(client, seenHostKey);
  }

  /** Run a command. Resolves with the exit code; rejects only on transport failure. */
  exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(friendlyConnectError(err));
          return;
        }

        let stdout = "";
        let stderr = "";
        let outBuf = "";
        let errBuf = "";
        let settled = false;
        let timer: NodeJS.Timeout | undefined;

        const flush = (buf: string, which: "stdout" | "stderr", final: boolean) => {
          if (!opts.onLine) return buf;
          const parts = buf.split(/\r?\n/);
          const rest = final ? "" : (parts.pop() ?? "");
          for (const line of parts) {
            if (line.length > 0) opts.onLine(line, which);
          }
          if (final && rest) opts.onLine(rest, which);
          return rest;
        };

        const finish = (code: number) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          flush(outBuf, "stdout", true);
          flush(errBuf, "stderr", true);
          resolve({ code, stdout, stderr });
        };

        if (opts.timeoutMs) {
          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            stream.close();
            reject(
              new SshError(
                `Command timed out after ${Math.round(opts.timeoutMs! / 1000)}s`,
                "timeout"
              )
            );
          }, opts.timeoutMs);
        }

        stream.on("data", (d: Buffer) => {
          const s = d.toString("utf8");
          stdout += s;
          outBuf = flush(outBuf + s, "stdout", false);
        });
        stream.stderr.on("data", (d: Buffer) => {
          const s = d.toString("utf8");
          stderr += s;
          errBuf = flush(errBuf + s, "stderr", false);
        });
        stream.on("close", (code: number | null) => finish(code ?? 255));
        stream.on("error", (e: Error) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          reject(friendlyConnectError(e));
        });

        if (opts.stdinStream) {
          opts.stdinStream.pipe(stream);
        } else if (opts.stdin !== undefined) {
          stream.end(opts.stdin);
        } else {
          stream.end();
        }
      });
    });
  }

  /** Run a shell script by feeding it to `bash -s`, avoiding any quoting. */
  script(body: string, opts: Omit<ExecOptions, "stdin" | "stdinStream"> = {}) {
    return this.exec("bash -s", { ...opts, stdin: body });
  }

  /**
   * Upload a local file by piping it into `cat`. Uses only an exec channel, so
   * it works even if the bastion does not forward SFTP.
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const result = await this.exec(
      `cat > ${shellQuote(remotePath)}.partial && mv ${shellQuote(remotePath)}.partial ${shellQuote(remotePath)}`,
      { stdinStream: createReadStream(localPath), timeoutMs: 10 * 60_000 }
    );
    if (result.code !== 0) {
      throw new SshError(
        `Upload failed (exit ${result.code}): ${result.stderr.trim() || "no output"}`,
        "exec"
      );
    }
  }

  async writeFile(remotePath: string, content: string, mode = "644") {
    const result = await this.exec(
      `umask 077 && cat > ${shellQuote(remotePath)} && chmod ${mode} ${shellQuote(remotePath)}`,
      { stdin: content }
    );
    if (result.code !== 0) {
      throw new SshError(
        `Could not write ${remotePath}: ${result.stderr.trim()}`,
        "exec"
      );
    }
  }

  /**
   * Open an interactive shell (a PTY) that starts in `opts.cwd`. The handle
   * reports when the shell ends or this connection drops.
   */
  async openShell(opts: ShellOptions): Promise<ShellHandle> {
    try {
      return await openShellOnClient(this.client, opts);
    } catch (err) {
      throw friendlyConnectError(err);
    }
  }

  close() {
    this.client.end();
  }
}

/** POSIX single-quote escaping for values interpolated into shell commands. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
