import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Server, utils, type Connection } from "ssh2";
import { fingerprintOfPublicKey } from "@/server/ssh/keys";

/**
 * A tiny in-process SSH server that behaves like a Nest container: public key
 * auth, exec channels, and a scratch HOME.
 *
 * Commands run on a real Linux userland. On Linux and macOS that is the host
 * itself. On Windows it is the first available WSL distro, because Git Bash
 * cannot create real symlinks and the release switch depends on them.
 */

export type MockSshOptions = {
  /** Public key lines allowed to authenticate. */
  authorizedKeys: string[];
  /** Override how exec requests are answered. */
  handler?: (
    command: string,
    stdin: Buffer
  ) => Promise<{ code: number; stdout?: string; stderr?: string }>;
};

export type MockSsh = {
  port: number;
  hostKeyFingerprint: string;
  /** A scratch HOME inside the Linux userland (a Linux path). */
  home: string;
  /** Commands received, in order. */
  commands: string[];
  /** Write a file inside the fake container. */
  writeFile: (remotePath: string, content: string, mode?: string) => void;
  /** Add an executable to the fake container's PATH. */
  addShim: (name: string, body: string) => void;
  stop: () => Promise<void>;
};

const DISTRO = process.env.TEST_WSL_DISTRO ?? "Ubuntu";

let wslChecked: boolean | undefined;
export function useWsl(): boolean {
  if (process.platform !== "win32") return false;
  if (wslChecked === undefined) {
    const r = spawnSync("wsl.exe", ["-d", DISTRO, "-e", "true"], { timeout: 30000 });
    wslChecked = r.status === 0;
  }
  return wslChecked;
}

function linuxSpawn(args: string[]) {
  return useWsl()
    ? spawn("wsl.exe", ["-d", DISTRO, "-e", ...args])
    : spawn(args[0], args.slice(1));
}

const WRAP =
  // Keep the real user's ~/.local/bin on PATH (that is where node lives in WSL),
  // then switch HOME to the scratch directory.
  'export PATH="$HOME/.local/bin:$PATH"; export HOME="$1"; export PATH="$HOME/.shims:$PATH"; cd "$HOME"; exec bash -c "$2"';

function runIn(home: string, command: string, stdin: Buffer) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = linuxSpawn(["bash", "-c", WRAP, "_", home, command]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

function runSync(home: string, command: string, input?: string) {
  const args = ["bash", "-c", WRAP, "_", home, command];
  return useWsl()
    ? spawnSync("wsl.exe", ["-d", DISTRO, "-e", ...args], { input })
    : spawnSync(args[0], args.slice(1), { input });
}

export async function startMockSsh(opts: MockSshOptions): Promise<MockSsh> {
  const hostKey = utils.generateKeyPairSync("ed25519");
  const commands: string[] = [];

  let home: string;
  if (useWsl()) {
    home = `/tmp/nd-home-${randomBytes(5).toString("hex")}`;
  } else {
    home = mkdtempSync(path.join(tmpdir(), "nd-home-")).replace(/\\/g, "/");
  }
  runSync(home, "mkdir -p \"$HOME/.shims\"");

  const allowed = opts.authorizedKeys.map((line) => {
    const parsed = utils.parseKey(line);
    if (parsed instanceof Error) throw parsed;
    return Array.isArray(parsed) ? parsed[0] : parsed;
  });

  const handler = opts.handler ?? ((command, stdin) => runIn(home, command, stdin));

  const server = new Server({ hostKeys: [hostKey.private] }, (client: Connection) => {
    client.on("authentication", (ctx) => {
      if (ctx.method !== "publickey") return ctx.reject(["publickey"]);
      const match = allowed.find(
        (k) => k.type === ctx.key.algo && Buffer.compare(k.getPublicSSH(), ctx.key.data) === 0
      );
      if (!match) return ctx.reject(["publickey"]);
      if (ctx.signature && match.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) !== true) {
        return ctx.reject(["publickey"]);
      }
      ctx.accept();
    });
    client.on("error", () => {});
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (acceptExec, _reject, info) => {
          const stream = acceptExec();
          commands.push(info.command);
          const chunks: Buffer[] = [];
          stream.on("data", (d: Buffer) => chunks.push(d));
          stream.on("end", async () => {
            try {
              const r = await handler(info.command, Buffer.concat(chunks));
              if (r.stdout) stream.write(r.stdout);
              if (r.stderr) stream.stderr.write(r.stderr);
              stream.exit(r.code);
            } catch {
              stream.exit(1);
            }
            stream.end();
          });
        });
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const writeFile = (remotePath: string, content: string, mode = "644") => {
    const r = runSync(home, `mkdir -p "$(dirname '${remotePath}')" && cat > '${remotePath}' && chmod ${mode} '${remotePath}'`, content);
    if (r.status !== 0) throw new Error(`mock writeFile failed: ${r.stderr?.toString()}`);
  };

  return {
    port,
    hostKeyFingerprint: fingerprintOfPublicKey(hostKey.public),
    home,
    commands,
    writeFile,
    addShim: (name, body) => writeFile(`${home}/.shims/${name}`, `#!/usr/bin/env bash\n${body}\n`, "755"),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          // Stop anything the pipeline started, then remove the scratch home.
          runSync(
            home,
            'for f in "$HOME"/.fake-systemd/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; done; true'
          );
          if (useWsl()) runSync("/tmp", `rm -rf '${home}'`);
          else {
            try {
              rmSync(home, { recursive: true, force: true });
            } catch {
              /* best effort */
            }
          }
          resolve();
        });
      }),
  };
}
