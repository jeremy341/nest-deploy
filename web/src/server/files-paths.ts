/**
 * Path rules for the project file manager. Pure: no I/O, so every rule can be
 * tested directly and the same rules run before any SSH call is made.
 *
 * Paths are relative to the project's folder on the container
 * (`<home>/.nest-deploy/<slug>/`). The empty string is the folder itself.
 *
 *   shared/**    writable, survives deploys
 *   current/**   readable; writes are allowed but last only until the next
 *                deploy, because `current` points at a release folder
 *   releases/**, incoming/**, anything else   read only
 */

export const MAX_PATH_LENGTH = 1024;
/** Text preview and edit cap. */
export const READ_LIMIT = 1024 * 1024;
/** Upload and download cap. */
export const DOWNLOAD_LIMIT = 50 * 1024 * 1024;
export const UPLOAD_LIMIT = DOWNLOAD_LIMIT;
/** Longest single name most filesystems accept. */
export const MAX_SEGMENT_BYTES = 255;

export type PathErrorCode = "bad_path" | "read_only";

export class PathError extends Error {
  constructor(
    message: string,
    readonly code: PathErrorCode = "bad_path",
    readonly status: 400 | 403 = 400
  ) {
    super(message);
    this.name = "PathError";
  }
}

/**
 * Normalise a relative path. Returns "" for the project folder itself.
 * Throws PathError for NUL bytes, `..`, absolute paths, empty segments
 * (`a//b`, a trailing slash) and anything over 1024 characters. `.` segments
 * are dropped.
 */
export function normalizePath(input: unknown): string {
  if (typeof input !== "string") throw new PathError("Path must be text.");
  if (input.length > MAX_PATH_LENGTH) {
    throw new PathError(`Path is longer than ${MAX_PATH_LENGTH} characters.`);
  }
  if (input.includes("\0")) throw new PathError("Path contains a NUL byte.");
  if (input === "") return "";
  if (input.startsWith("/")) {
    throw new PathError("Path must be relative to the project folder.");
  }
  const kept: string[] = [];
  for (const segment of input.split("/")) {
    if (segment === "") throw new PathError("Path contains an empty segment.");
    if (segment === "..") throw new PathError("Path cannot go up with '..'.");
    if (Buffer.byteLength(segment, "utf8") > MAX_SEGMENT_BYTES) {
      throw new PathError(`A name in the path is longer than ${MAX_SEGMENT_BYTES} bytes.`);
    }
    if (segment === ".") continue;
    kept.push(segment);
  }
  return kept.join("/");
}

export type Area = "root" | "shared" | "current" | "releases" | "incoming" | "other";

export type Scope = {
  /** Normalised path the scope describes. */
  path: string;
  area: Area;
  /** Number of segments (0 for the project folder). */
  depth: number;
  /** New files and folders can be created inside this folder. */
  writable: boolean;
  /** This path itself can be written, renamed or deleted. */
  modifiable: boolean;
  /** Changes here are lost on the next deploy. */
  temporary: boolean;
};

export function scopeOf(input: string): Scope {
  const path = normalizePath(input);
  const segments = path === "" ? [] : path.split("/");
  const first = segments[0];
  const area: Area =
    first === undefined
      ? "root"
      : first === "shared" || first === "current" || first === "releases" || first === "incoming"
        ? first
        : "other";
  const writable = area === "shared" || area === "current";
  return {
    path,
    area,
    depth: segments.length,
    writable,
    // `shared` and `current` themselves are fixtures of the layout.
    modifiable: writable && segments.length >= 2,
    temporary: area === "current",
  };
}

export const READ_ONLY_MESSAGE =
  "This location is read only. Use shared/ for files that last, or current/ for changes that last until the next deploy.";

/** Throws unless `path` itself may be written, created, renamed or deleted. */
export function assertModifiable(input: string): Scope {
  const scope = scopeOf(input);
  if (!scope.modifiable) throw new PathError(READ_ONLY_MESSAGE, "read_only", 403);
  return scope;
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/** A single new name (for rename and new folder): one segment, no slash. */
export function assertSimpleName(name: string): string {
  if (typeof name !== "string" || name.trim() === "") throw new PathError("Enter a name.");
  if (name.includes("/")) throw new PathError("A name cannot contain a slash.");
  if (name === "." || name === "..") throw new PathError("That name is not allowed.");
  return normalizePath(name);
}

/**
 * Symlink containment, on resolved (real) paths. `realPath` must already have
 * had every symlink followed (`readlink -f`). Whole-segment prefix match, so
 * `/home/x/.nest-deploy/app-evil` is not inside `/home/x/.nest-deploy/app`.
 */
export function isInsideRoot(realRoot: string, realPath: string): boolean {
  const root = realRoot.replace(/\/+$/, "");
  return realPath === root || realPath.startsWith(`${root}/`);
}

/**
 * Where, physically, a write may land once links are resolved: shared/, or
 * inside a release folder (which is where `current/` points). Not the project
 * folder, `releases/` itself, `incoming/` or `current` itself.
 */
export function isWritableReal(realRoot: string, realPath: string): boolean {
  const root = realRoot.replace(/\/+$/, "");
  if (realPath === `${root}/shared` || realPath.startsWith(`${root}/shared/`)) return true;
  return realPath.startsWith(`${root}/releases/`) && realPath.length > `${root}/releases/`.length;
}
