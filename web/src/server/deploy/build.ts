import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import * as tar from "tar";
import { config } from "@/server/config";
import {
  resolveRuntime,
  type ProjectFiles,
  type RuntimeInput,
  type RuntimeSpec,
} from "@/server/deploy/runtime";

export type LogFn = (level: "info" | "warn" | "error", message: string) => void;

export type BuildRequest = {
  deploymentId: string;
  runtime: RuntimeInput;
  rootDir: string;
  source: {
    cloneUrl: string;
    /** GitHub installation token for private repos. */
    token?: string | null;
    branch: string;
    sha?: string | null;
  };
  /** Variables for the build step. Never printed. */
  env: Record<string, string>;
  log: LogFn;
  signal?: AbortSignal;
};

export type BuildResult = {
  archivePath: string;
  sha256: string;
  sizeBytes: number;
  commit: { sha: string; message: string; author: string };
  spec: RuntimeSpec;
  files: ProjectFiles;
  /** Folder to delete when the deployment finishes. */
  workDir: string;
};

export type Builder = (req: BuildRequest) => Promise<BuildResult>;

export const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

export class BuildError extends Error {}

const ALLOWED_GIT_HOSTS = ["github.com"];

/** Only clone https URLs from hosts we expect. Blocks file://, ssh and internal hosts. */
export function assertCloneUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BuildError("The repository URL is not valid.");
  }
  if (u.protocol !== "https:" || u.username || u.password) {
    throw new BuildError("Only plain https repository URLs are supported.");
  }
  if (!ALLOWED_GIT_HOSTS.includes(u.hostname.toLowerCase())) {
    throw new BuildError(
      `Repositories on ${u.hostname} are not supported yet. Supported: ${ALLOWED_GIT_HOSTS.join(", ")}.`
    );
  }
}

/** Resolve a user-supplied folder inside `base`, refusing `..` escapes. */
export function resolveInside(base: string, rel: string): string {
  const full = path.resolve(base, rel || ".");
  const root = path.resolve(base);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new BuildError(`"${rel}" is outside the repository.`);
  }
  return full;
}

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with the child so callers can kill a container on timeout. */
  onTimeout?: () => void;
};

/** Spawn a process, stream its output by line, and resolve with the exit code. */
export function runProcess(
  command: string,
  args: string[],
  opts: RunOptions = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          opts.onTimeout?.();
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    const abort = () => {
      opts.onTimeout?.();
      child.kill("SIGKILL");
    };
    opts.signal?.addEventListener("abort", abort, { once: true });

    const pump = (stream: NodeJS.ReadableStream) => {
      let buf = "";
      stream.on("data", (d: Buffer) => {
        buf += d.toString("utf8");
        const parts = buf.split(/\r?\n/);
        buf = parts.pop() ?? "";
        for (const l of parts) if (l.length) opts.onLine?.(l);
      });
      stream.on("end", () => {
        if (buf.length) opts.onLine?.(buf);
      });
    };
    pump(child.stdout);
    pump(child.stderr);

    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new BuildError(`Could not start ${command}: ${e.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
      if (timedOut) reject(new BuildError("The build timed out."));
      else if (opts.signal?.aborted) reject(new BuildError("The build was canceled."));
      else resolve(code ?? 1);
    });
  });
}

function bashPath() {
  return process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
}

export function detectFiles(dir: string): ProjectFiles {
  const has = (f: string) => existsSync(path.join(dir, f));
  let hasBuildScript = false;
  const hasPackageJson = has("package.json");
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
      hasBuildScript = typeof pkg?.scripts?.build === "string";
    } catch {
      /* a broken package.json is reported by the build itself */
    }
  }
  return {
    lockfile: has("pnpm-lock.yaml")
      ? "pnpm"
      : has("yarn.lock")
        ? "yarn"
        : has("package-lock.json")
          ? "npm"
          : null,
    hasPackageJson,
    hasBuildScript,
    hasRequirements: has("requirements.txt"),
  };
}

function redactor(secrets: string[]) {
  const list = secrets.filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
  return (line: string) => {
    let out = line;
    for (const s of list) out = out.split(s).join("***");
    return out;
  };
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve())
      .on("error", reject);
  });
  return hash.digest("hex");
}

/** Clone, build in a sandbox, and pack the result. */
export const defaultBuilder: Builder = async (req) => {
  const c = config();
  const workDir = path.resolve(c.DEPLOY_WORK_DIR, req.deploymentId);
  const srcDir = path.join(workDir, "src");
  mkdirSync(workDir, { recursive: true });

  const redact = redactor([req.source.token ?? "", ...Object.values(req.env)]);
  const log: LogFn = (level, msg) => req.log(level, redact(msg));
  const line = (l: string) => log("info", l);

  try {
    // 1. Clone
    assertCloneUrl(req.source.cloneUrl);
    log("info", `Cloning ${req.source.cloneUrl} (branch ${req.source.branch})`);
    const gitArgs: string[] = [];
    if (req.source.token) {
      const basic = Buffer.from(`x-access-token:${req.source.token}`).toString("base64");
      gitArgs.push("-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`);
    }
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" };
    const cloneCode = await runProcess(
      "git",
      [
        ...gitArgs,
        "clone",
        "--depth",
        "1",
        "--branch",
        req.source.branch,
        "--single-branch",
        "--no-tags",
        req.source.cloneUrl,
        srcDir,
      ],
      { env: gitEnv, onLine: line, timeoutMs: 5 * 60_000, signal: req.signal }
    );
    if (cloneCode !== 0) {
      throw new BuildError(
        "Could not clone the repository. Check the branch name and that Nest Deploy has access to it."
      );
    }

    if (req.source.sha) {
      let head = "";
      await runProcess("git", ["rev-parse", "HEAD"], {
        cwd: srcDir,
        env: gitEnv,
        onLine: (l) => (head = l.trim()),
      });
      if (head !== req.source.sha) {
        const f = await runProcess("git", [...gitArgs, "fetch", "--depth", "1", "origin", req.source.sha], {
          cwd: srcDir,
          env: gitEnv,
          onLine: line,
          timeoutMs: 3 * 60_000,
          signal: req.signal,
        });
        if (f === 0) {
          await runProcess("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: srcDir, env: gitEnv, onLine: line });
        } else {
          log("warn", `Could not fetch ${req.source.sha.slice(0, 7)}; building the branch tip instead.`);
        }
      }
    }

    const info: string[] = [];
    await runProcess("git", ["log", "-1", "--format=%H%n%an%n%s"], {
      cwd: srcDir,
      env: gitEnv,
      onLine: (l) => info.push(l),
    });
    const commit = {
      sha: info[0] ?? "",
      author: info[1] ?? "",
      message: info.slice(2).join(" ").slice(0, 300),
    };
    log("info", `Commit ${commit.sha.slice(0, 7)}: ${commit.message}`);

    // 2. Build
    const appDir = resolveInside(srcDir, req.rootDir);
    if (!existsSync(appDir)) {
      throw new BuildError(`The root directory "${req.rootDir}" does not exist in this repository.`);
    }
    const files = detectFiles(appDir);
    const spec = resolveRuntime(req.runtime, files);

    const script = [spec.buildInstall, spec.buildCommand]
      .filter((s): s is string => Boolean(s))
      .join(" && ");
    if (script) {
      log("info", `Building: ${script}`);
      const code = await runBuildScript(script, appDir, srcDir, req, line);
      if (code !== 0) throw new BuildError(`The build failed (exit ${code}).`);
    } else {
      log("info", "No build step for this project.");
    }

    // 3. Pack
    const root = resolveInside(appDir, spec.archiveRoot);
    if (!existsSync(root)) {
      throw new BuildError(
        `The output folder "${spec.archiveRoot}" was not created by the build.`
      );
    }
    const archivePath = path.join(workDir, "release.tar.gz");
    await tar.create(
      {
        gzip: true,
        file: archivePath,
        cwd: root,
        portable: true,
        filter: (p) => {
          const parts = p.replace(/^\.\//, "").split("/");
          if (parts[0] === ".git") return false;
          if (spec.excludeNodeModules && parts.includes("node_modules")) return false;
          if (parts[0] === ".next" && parts[1] === "cache") return false;
          return true;
        },
      },
      ["."]
    );
    const size = statSync(archivePath).size;
    if (size > MAX_ARCHIVE_BYTES) {
      throw new BuildError(
        `The build output is ${(size / 1e6).toFixed(0)} MB, over the ${MAX_ARCHIVE_BYTES / 1e6} MB limit.`
      );
    }
    log("info", `Packed release: ${(size / 1e6).toFixed(1)} MB`);

    return {
      archivePath,
      sha256: await sha256File(archivePath),
      sizeBytes: size,
      commit,
      spec,
      files,
      workDir,
    };
  } catch (err) {
    rmSync(workDir, { recursive: true, force: true });
    throw err;
  }
};

async function runBuildScript(
  script: string,
  appDir: string,
  srcDir: string,
  req: BuildRequest,
  onLine: (line: string) => void
): Promise<number> {
  const c = config();
  const timeoutMs = c.BUILD_TIMEOUT_SECONDS * 1000;
  const env = { ...req.env, CI: "true" };

  if (c.BUILD_RUNNER === "local") {
    // No isolation. Development only; the worker logs a warning at startup.
    return runProcess(bashPath(), ["-c", `set -e; ${script}`], {
      cwd: appDir,
      env: { ...process.env, ...env },
      onLine,
      timeoutMs,
      signal: req.signal,
    });
  }

  const image =
    req.runtime.runtime === "python" ? c.BUILD_IMAGE_PYTHON : c.BUILD_IMAGE_NODE;
  const rel = path.relative(srcDir, appDir).split(path.sep).join("/");
  const name = `nd-build-${req.deploymentId.slice(0, 8)}`;
  const args = [
    "run",
    "--rm",
    "--name",
    name,
    "--memory",
    "2g",
    "--memory-swap",
    "2g",
    "--cpus",
    "2",
    "--pids-limit",
    "2048",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "-v",
    `${srcDir}:/src`,
    "-w",
    `/src/${rel}`.replace(/\/$/, ""),
    "-e",
    "HOME=/tmp",
  ];
  if (process.platform !== "win32" && process.getuid && process.getgid) {
    args.push("--user", `${process.getuid()}:${process.getgid()}`);
  }
  // Values are passed through the docker CLI's own environment, not argv.
  for (const key of Object.keys(env)) args.push("-e", key);
  args.push(image, "sh", "-c", `set -e; ${script}`);

  return runProcess("docker", args, {
    env: { ...process.env, ...env },
    onLine,
    timeoutMs,
    signal: req.signal,
    onTimeout: () => {
      void runProcess("docker", ["kill", name]).catch(() => {});
    },
  });
}
