import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import * as tar from "tar";
import { createHash } from "node:crypto";
import { statSync, readFileSync } from "node:fs";
import type { Builder, BuildRequest } from "@/server/deploy/build";
import { detectFiles } from "@/server/deploy/build";
import { resolveRuntime } from "@/server/deploy/runtime";
import type { MockSsh } from "@/server/test/mock-ssh";

/** A port nothing is listening on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

/**
 * Teach the mock container to behave like systemd for the few verbs the
 * pipeline uses. `restart` starts the unit's ExecStart in the background and
 * records a pid, so the health check really talks to a running process.
 */
export function installFakeSystemd(mock: MockSsh) {
  const dir = path.join(process.cwd(), "src/server/test/shims");
  mock.addShim("systemctl", readFileSync(path.join(dir, "systemctl.sh"), "utf8"));
  mock.addShim("journalctl", readFileSync(path.join(dir, "journalctl.sh"), "utf8"));
  mock.writeFile(`${mock.home}/units/.keep`, "");
}

export type FixtureFiles = Record<string, string>;

/** A tiny app: answers GET / with the value of GREETING and its version. */
export function nodeApp(version: string, extra: FixtureFiles = {}): FixtureFiles {
  return {
    "server.js": `
const http = require('http');
http.createServer((req, res) => {
  res.end('${version}:' + (process.env.GREETING || 'none'));
}).listen(Number(process.env.PORT), '0.0.0.0');
`,
    ...extra,
  };
}

/** An app that starts and then dies, so the health check must fail. */
export function brokenApp(): FixtureFiles {
  return { "server.js": "process.exit(1);\n" };
}

/**
 * A Builder that packs a prepared set of files instead of cloning and
 * building. Everything after the build is the real pipeline.
 */
export function fakeBuilder(
  files: () => FixtureFiles,
  hooks: { onBuild?: (req: BuildRequest) => void } = {}
): Builder {
  return async (req) => {
    hooks.onBuild?.(req);
    const work = mkdtempSync(path.join(tmpdir(), "nd-build-"));
    const src = path.join(work, "src");
    mkdirSync(src, { recursive: true });
    for (const [name, content] of Object.entries(files())) {
      const full = path.join(src, name);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const found = detectFiles(src);
    const spec = resolveRuntime(req.runtime, found);
    const archivePath = path.join(work, "release.tar.gz");
    await tar.create({ gzip: true, file: archivePath, cwd: src, portable: true }, ["."]);
    const sha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
    // Echo a line containing every env value, to prove log masking works.
    req.log("info", `build env: ${Object.values(req.env).join(",")}`);
    return {
      archivePath,
      sha256,
      sizeBytes: statSync(archivePath).size,
      commit: { sha: "a".repeat(40), message: "test commit", author: "tester" },
      spec,
      files: found,
      workDir: work,
    };
  };
}

export function removeDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows may still hold files from a stopped process */
  }
}
