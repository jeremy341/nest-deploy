import { GithubError, headers, installationToken } from "@/server/github/app";
import type { ProjectFiles } from "@/server/deploy/runtime";

/**
 * What is in a project's root directory, for the monorepo hint in settings.
 *
 * The build's own `detectFiles` reads a local checkout, which only exists
 * during a deployment. Here we read the same facts from GitHub instead (a
 * folder listing plus package.json), and keep the same lockfile order so the
 * answer matches what a build would decide.
 */

export type RootDetection = {
  status: "ok" | "missing" | "unavailable";
  /** Why detection could not run, or what to do about it. */
  message: string | null;
  packageJson: boolean;
  lockfile: ProjectFiles["lockfile"];
  requirements: boolean;
  /** Names of the package.json scripts that matter: "start" and/or "build". */
  scripts: { start: boolean; build: boolean };
  /** The package name from package.json, when it has one. */
  packageName: string | null;
};

const EMPTY: Omit<RootDetection, "status" | "message"> = {
  packageJson: false,
  lockfile: null,
  requirements: false,
  scripts: { start: false, build: false },
  packageName: null,
};

/** Pure: turn a folder listing and the parsed package.json into a detection. */
export function summarizeRoot(entries: string[], pkg: unknown): RootDetection {
  const has = (f: string) => entries.includes(f);
  const p = (pkg && typeof pkg === "object" ? pkg : {}) as {
    name?: unknown;
    scripts?: Record<string, unknown>;
  };
  return {
    status: "ok",
    message: null,
    packageJson: has("package.json"),
    lockfile: has("pnpm-lock.yaml")
      ? "pnpm"
      : has("yarn.lock")
        ? "yarn"
        : has("package-lock.json")
          ? "npm"
          : null,
    requirements: has("requirements.txt"),
    scripts: {
      start: typeof p.scripts?.start === "string",
      build: typeof p.scripts?.build === "string",
    },
    packageName: typeof p.name === "string" ? p.name.slice(0, 100) : null,
  };
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** "owner/name" from the stored name or a github.com clone URL. */
export function repoFromProject(p: { repoFullName: string | null; repoUrl: string }): string | null {
  if (p.repoFullName && REPO.test(p.repoFullName)) return p.repoFullName;
  try {
    const u = new URL(p.repoUrl);
    if (u.hostname.toLowerCase() !== "github.com") return null;
    const name = u.pathname.replace(/^\//, "").replace(/\.git$/, "").replace(/\/$/, "");
    return REPO.test(name) ? name : null;
  } catch {
    return null;
  }
}

/** Normalise the root directory setting to a clean relative path ("" for the repo root). */
export function cleanRootDir(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("/")) return null;
  const parts = trimmed.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.includes("..") || parts.length > 8) return null;
  if (!parts.every((s) => /^[A-Za-z0-9._@~+ -]+$/.test(s))) return null;
  return parts.join("/");
}

type FetchLike = typeof fetch;
const API = "https://api.github.com";

async function detectRootInner(
  project: {
    repoFullName: string | null;
    repoUrl: string;
    installationId: number | null;
    productionBranch: string;
  },
  rootDirInput: string,
  fetchImpl: FetchLike = fetch
): Promise<RootDetection> {
  const unavailable = (message: string): RootDetection => ({
    ...EMPTY,
    status: "unavailable",
    message,
  });
  const repo = repoFromProject(project);
  const dir = cleanRootDir(rootDirInput);
  if (!repo) return unavailable("Only GitHub repositories can be inspected here.");
  if (dir === null) return unavailable("That root directory is not a valid relative path.");

  let token: string | null = null;
  if (project.installationId) {
    try {
      token = await installationToken(project.installationId, fetchImpl);
    } catch (err) {
      if (!(err instanceof GithubError)) throw err;
    }
  }
  const h = (accept?: string) => {
    const base = headers(token ?? "", accept ? { accept } : {});
    if (!token) delete (base as Partial<typeof base>).authorization;
    return base;
  };
  const url = (path: string) =>
    `${API}/repos/${repo}/contents/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(project.productionBranch)}`;

  const list = await fetchImpl(url(dir), { headers: h(), signal: AbortSignal.timeout(8000) });
  if (list.status === 404) {
    return {
      ...EMPTY,
      status: "missing",
      message: token
        ? `No folder called "${dir || "."}" on the ${project.productionBranch} branch.`
        : `No folder called "${dir || "."}" was found. If the repository is private, install the GitHub App so it can be read.`,
    };
  }
  if (!list.ok) return unavailable(`GitHub did not answer (${list.status}). Try again later.`);
  const body = (await list.json()) as unknown;
  if (!Array.isArray(body)) return unavailable("That path is a file, not a folder.");
  const entries = body
    .filter((e): e is { name: string; type: string } => typeof e?.name === "string")
    .filter((e) => e.type === "file")
    .map((e) => e.name);

  let pkg: unknown = null;
  if (entries.includes("package.json")) {
    const file = await fetchImpl(url(dir ? `${dir}/package.json` : "package.json"), {
      headers: h("application/vnd.github.raw+json"),
      signal: AbortSignal.timeout(8000),
    });
    if (file.ok) {
      const text = await file.text();
      if (text.length <= 1_000_000) {
        try {
          pkg = JSON.parse(text);
        } catch {
          /* a broken package.json is reported by the build itself */
        }
      }
    }
  }
  return summarizeRoot(entries, pkg);
}

/** Never throws for network problems: a failed lookup is reported as "unavailable". */
export async function detectRoot(
  project: Parameters<typeof detectRootInner>[0],
  rootDirInput: string,
  fetchImpl: FetchLike = fetch
): Promise<RootDetection> {
  try {
    return await detectRootInner(project, rootDirInput, fetchImpl);
  } catch {
    return {
      ...EMPTY,
      status: "unavailable",
      message: "Could not reach GitHub to look. Try again in a moment.",
    };
  }
}
