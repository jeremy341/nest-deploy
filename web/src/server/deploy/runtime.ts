import type { Runtime } from "@/server/db/schema";
import type { NestProbe } from "@/server/ssh/probe";
import { shellQuote } from "@/server/ssh/connection";

export type ProjectFiles = {
  /** Package manager implied by the lockfile in the project root. */
  lockfile: "npm" | "pnpm" | "yarn" | null;
  hasPackageJson: boolean;
  hasBuildScript: boolean;
  hasRequirements: boolean;
};

export type RuntimeInput = {
  runtime: Runtime;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  outputDir: string | null;
};

export type RuntimeSpec = {
  /** Run in the build sandbox, with dev dependencies. */
  buildInstall: string | null;
  buildCommand: string | null;
  /** Run on the Nest container after unpacking. */
  remoteInstall: string | null;
  /** Folder to archive, relative to the project root. */
  archiveRoot: string;
  /** Leave node_modules out of the archive (installed on Nest instead). */
  excludeNodeModules: boolean;
};

const INSTALL = {
  npm: { build: "npm ci", prod: "npm ci --omit=dev" },
  pnpm: {
    build: "corepack enable && pnpm install --frozen-lockfile",
    prod: "corepack enable && pnpm install --prod --frozen-lockfile",
  },
  yarn: {
    build: "corepack enable && yarn install --frozen-lockfile",
    prod: "corepack enable && yarn install --production --frozen-lockfile",
  },
} as const;

const RUN = { npm: "npm run build", pnpm: "pnpm build", yarn: "yarn build" } as const;

export function resolveRuntime(input: RuntimeInput, files: ProjectFiles): RuntimeSpec {
  switch (input.runtime) {
    case "node": {
      const pm = files.lockfile ?? "npm";
      const buildInstall =
        input.installCommand ??
        (files.hasPackageJson
          ? files.lockfile
            ? INSTALL[pm].build
            : "npm install"
          : null);
      const build = input.buildCommand ?? (files.hasBuildScript ? RUN[pm] : null);
      const remoteInstall = files.hasPackageJson
        ? files.lockfile
          ? INSTALL[pm].prod
          : "npm install --omit=dev"
        : null;
      return {
        buildInstall,
        buildCommand: build,
        remoteInstall,
        archiveRoot: ".",
        excludeNodeModules: true,
      };
    }
    case "python":
      return {
        buildInstall: input.installCommand,
        buildCommand: input.buildCommand,
        remoteInstall: files.hasRequirements
          ? "python3 -m venv .venv && .venv/bin/pip install --disable-pip-version-check -r requirements.txt"
          : null,
        archiveRoot: ".",
        excludeNodeModules: false,
      };
    case "static":
      return {
        buildInstall:
          input.installCommand ??
          (files.hasPackageJson
            ? files.lockfile
              ? INSTALL[files.lockfile].build
              : "npm install"
            : null),
        buildCommand:
          input.buildCommand ??
          (files.hasPackageJson && files.hasBuildScript
            ? RUN[files.lockfile ?? "npm"]
            : null),
        remoteInstall: null,
        archiveRoot: input.outputDir?.trim() || ".",
        excludeNodeModules: true,
      };
    case "command":
      return {
        buildInstall: input.installCommand,
        buildCommand: input.buildCommand,
        remoteInstall: null,
        archiveRoot: ".",
        excludeNodeModules: false,
      };
  }
}

export class StartCommandError extends Error {}

/**
 * The command systemd runs. Always executed from the release folder with
 * PORT and HOST=0.0.0.0 set, because Nest's proxy reaches the container over
 * its network interface, not over localhost.
 */
export function resolveStartCommand(
  input: Pick<RuntimeInput, "runtime" | "startCommand">,
  probe: Pick<NestProbe, "has"> | null,
  port: number
): string {
  const given = input.startCommand?.trim();
  if (given) return given;

  switch (input.runtime) {
    case "node":
      return "npm start";
    case "python":
      return "python3 app.py";
    case "static": {
      if (!probe || probe.has.python3) {
        return `python3 -m http.server ${port} --bind 0.0.0.0`;
      }
      if (probe.has.node) {
        // A dependency-free static file server in one line.
        return `node -e ${shellQuote(NODE_STATIC)}`;
      }
      throw new StartCommandError(
        "Static sites need Python 3 or Node.js on your Nest container to be served."
      );
    }
    case "command":
      throw new StartCommandError(
        "Set a start command for this project (for example ./my-binary)."
      );
  }
}

const NODE_STATIC = `
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.cwd(),port=+process.env.PORT||3000;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain'};
http.createServer((q,r)=>{let p=path.normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\\.\\.[\\/\\\\])+/,'');
let f=path.join(root,p);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end('Not found');return}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});r.end(d)})}).listen(port,'0.0.0.0');
`.trim();

export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Variables that would break the service or let a project hijack its unit. */
export const RESERVED_ENV = new Set(["PORT", "HOST", "PATH", "HOME", "NEST_DEPLOY"]);

/** systemd EnvironmentFile syntax: KEY="value" with C-style escapes. */
export function renderEnvFile(vars: Record<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(vars)) {
    if (!ENV_KEY.test(k)) throw new Error(`Invalid environment variable name: ${k}`);
    const escaped = v
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, "\\n");
    lines.push(`${k}="${escaped}"`);
  }
  return lines.join("\n") + "\n";
}
