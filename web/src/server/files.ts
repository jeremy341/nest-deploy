import { audit } from "@/server/audit";
import { projectDir } from "@/server/deploy/layout";
import {
  DOWNLOAD_LIMIT,
  PathError,
  READ_LIMIT,
  UPLOAD_LIMIT,
  assertModifiable,
  baseName,
  normalizePath,
  scopeOf,
  type Scope,
} from "@/server/files-paths";
import { HttpError } from "@/server/http";
import { getProjectForUser, type ProjectRow } from "@/server/projects";
import { getServerForUser, withServerSession } from "@/server/servers";
import { SshError, shellQuote, type ExecOptions, type ExecResult } from "@/server/ssh/connection";

/**
 * The remote half of the file manager. Every operation is one `bash -c` run
 * over SSH. The script text is a constant; the only variable parts are
 * positional arguments, each passed through shellQuote, so a file name can
 * never become shell syntax. Every script re-checks, on the container, that
 * the real path (symlinks resolved with `readlink -f`) stays inside the
 * project folder, so a link cannot lead out of it.
 *
 * File contents travel base64 on stdout (the SSH helper decodes output as
 * text) and raw on stdin. Contents are never logged.
 */

export { READ_LIMIT, DOWNLOAD_LIMIT, UPLOAD_LIMIT };
export const LIST_LIMIT = 3000;

/** The slice of NestSession these operations use. */
export type FileSession = {
  exec: (command: string, opts?: ExecOptions) => Promise<ExecResult>;
};

// ---------------------------------------------------------------------------
// Remote scripts

/**
 * Shared prelude. $1 is the project folder (absolute). `rl` resolves a path
 * with `readlink -f` into RL, keeping a trailing newline in a name intact.
 * `drain` is for scripts that read stdin: on failure they swallow it first so
 * the client is never left writing into a closed channel.
 * Exit codes are mapped in EXIT_ERRORS below.
 */
function prelude(drain = false): string {
  return `
set -u
die() { ${drain ? "cat >/dev/null; " : ""}exit "$1"; }
root=$1
[ -d "$root" ] || die 10
rl() { RL=$(readlink -f -- "$1" 2>/dev/null; printf x); RL=\${RL%x}; RL=\${RL%$'\\n'}; [ -n "$RL" ]; }
rl "$root" || die 10
rr=$RL
inside() { case "$1" in "$rr"|"$rr"/*) return 0;; esac; return 1; }
wr_ok() { case "$1" in "$rr/shared"|"$rr/shared/"*|"$rr/releases/"?*) return 0;; esac; return 1; }
resolve_existing() {
  if [ -n "$1" ]; then rl "$root/$1" || die 30; else RL=$rr; fi
  inside "$RL" || die 20
  [ -e "$RL" ] || die 30
}
parent_of() {
  NAME=\${1##*/}; prel=\${1%/*}; [ "$prel" = "$1" ] && prel=
  case "$NAME" in ""|.|..) die 20;; esac
  if [ -n "$prel" ]; then rl "$root/$prel" || die 30; else RL=$rr; fi
  PR=$RL
  inside "$PR" || die 20
  wr_ok "$PR" || die 21
  [ -e "$PR" ] || die 30
  [ -d "$PR" ] || die 33
}
exists() { [ -e "$1" ] || [ -L "$1" ]; }
`;
}

const PRELUDE = prelude();

export const SCRIPTS = {
  home: `printf %s "$HOME"`,

  // $2 relative path. NUL-separated records: type, link type, size, mtime, name, link target.
  list: `${PRELUDE}
resolve_existing "$2"
real=$RL
[ -d "$real" ] || die 33
LC_ALL=C find "$real" -maxdepth 0 -printf '' 2>/dev/null || die 40
printf 'a\\n' | head -z -n 1 >/dev/null 2>&1 || die 40
LC_ALL=C find "$real" -mindepth 1 -maxdepth 1 -printf '%y\\0%Y\\0%s\\0%T@\\0%f\\0%l\\0' 2>/dev/null | head -z -n ${(LIST_LIMIT + 1) * 6}
exit 0
`,

  // $2 relative path, $3 byte limit. First line is the size, then base64.
  read: `${PRELUDE}
resolve_existing "$2"
real=$RL
[ -f "$real" ] || die 34
size=$(stat -c %s -- "$real" 2>/dev/null) || die 50
printf '%s\\n' "$size"
head -c "$3" -- "$real" | base64 | tr -d '\\n'
exit 0
`,

  // $2 relative path, $3 byte limit.
  download: `${PRELUDE}
resolve_existing "$2"
real=$RL
[ -f "$real" ] || die 34
size=$(stat -c %s -- "$real" 2>/dev/null) || die 50
[ "$size" -le "$3" ] || die 35
printf '%s\\n' "$size"
base64 < "$real" | tr -d '\\n'
exit 0
`,

  // $2 relative path, $3 overwrite (1 or 0). Content on stdin.
  write: `${prelude(true)}
parent_of "$2"
tgt="$PR/$NAME"
[ -L "$tgt" ] && die 36
[ -d "$tgt" ] && die 37
if [ -e "$tgt" ] && [ "$3" != 1 ]; then die 38; fi
part="$tgt.partial"
trap 'rm -f -- "$part"' EXIT
rm -f -- "$part"
( set -C; umask 077; cat > "$part" ) || exit 51
if [ -e "$tgt" ]; then
  chmod --reference="$tgt" -- "$part" 2>/dev/null || chmod 644 -- "$part"
else
  chmod 644 -- "$part"
fi
mv -f -- "$part" "$tgt" || exit 52
trap - EXIT
exit 0
`,

  // $2 relative path of the new folder.
  mkdir: `${PRELUDE}
parent_of "$2"
tgt="$PR/$NAME"
exists "$tgt" && die 38
mkdir -m 755 -- "$tgt" || exit 51
exit 0
`,

  // $2 from, $3 to (relative paths).
  rename: `${PRELUDE}
parent_of "$2"
src="$PR/$NAME"
parent_of "$3"
dst="$PR/$NAME"
exists "$src" || die 30
exists "$dst" && die 38
mv -- "$src" "$dst" || exit 52
exit 0
`,

  // $2 relative path, $3 recursive (1 or 0).
  delete: `${PRELUDE}
parent_of "$2"
tgt="$PR/$NAME"
if [ -L "$tgt" ]; then rm -f -- "$tgt" || exit 52; exit 0; fi
[ -e "$tgt" ] || die 30
if [ -d "$tgt" ]; then
  [ "$3" = 1 ] || die 37
  rm -rf -- "$tgt" || exit 52
else
  rm -f -- "$tgt" || exit 52
fi
exit 0
`,
} as const;

/** `bash -c '<script>' _ 'arg' ...` with every argument quoted. */
export function buildCommand(script: string, args: readonly string[]): string {
  return `bash -c ${shellQuote(script)} _ ${args.map(shellQuote).join(" ")}`;
}

// ---------------------------------------------------------------------------
// Errors

const EXIT_ERRORS: Record<number, [status: number, code: string, message: string]> = {
  10: [404, "no_folder", "This project has no folder on your container yet. Deploy it first."],
  20: [403, "outside_scope", "That path leaves the project folder."],
  21: [403, "read_only", "This location is read only. Use shared/ for files that last."],
  30: [404, "not_found", "Nothing exists at that path."],
  33: [409, "not_a_folder", "That path is not a folder."],
  34: [409, "not_a_file", "That path is not a file."],
  35: [413, "too_large", "That file is over the 50 MB limit."],
  36: [409, "is_link", "That path is a symbolic link. Files are not written through links."],
  37: [409, "is_folder", "That path is a folder."],
  38: [409, "exists", "Something with that name already exists."],
  40: [502, "unsupported", "This container's tools are too limited to list files."],
};

function remoteError(code: number): HttpError {
  const known = EXIT_ERRORS[code];
  if (known) return new HttpError(known[0], known[2], known[1]);
  return new HttpError(502, "Your container could not finish that. Try again.", "upstream");
}

/** Run a path rule; turn its error into the API's error shape. */
function rules<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PathError) throw new HttpError(err.status, err.message, err.code);
    throw err;
  }
}

async function run(
  session: FileSession,
  script: string,
  args: readonly string[],
  opts: ExecOptions = {}
): Promise<string> {
  const res = await session.exec(buildCommand(script, args), { timeoutMs: 30_000, ...opts });
  if (res.code !== 0) throw remoteError(res.code);
  return res.stdout;
}

// ---------------------------------------------------------------------------
// Operations (all take the absolute project folder and a relative path)

export type EntryType = "file" | "dir" | "link" | "other";

export type FileEntry = {
  name: string;
  type: EntryType;
  /** Bytes. Only meaningful for files. */
  size: number;
  /** ISO time, or null when the container gave none. */
  modified: string | null;
  /** For links: where the link points, as written. */
  target: string | null;
  /** For links: what it points at. */
  linkTo: "file" | "dir" | "broken" | null;
};

export type DirListing = {
  path: string;
  scope: Pick<Scope, "area" | "writable" | "temporary">;
  entries: FileEntry[];
  /** More than LIST_LIMIT entries exist; the rest are not shown. */
  truncated: boolean;
};

const TYPE_BY_CHAR: Record<string, EntryType> = { f: "file", d: "dir", l: "link" };

export function parseListing(stdout: string): { entries: FileEntry[]; truncated: boolean } {
  const fields = stdout.split("\0");
  // Records end in NUL, so the last element is empty.
  if (fields[fields.length - 1] === "") fields.pop();
  const entries: FileEntry[] = [];
  for (let i = 0; i + 5 < fields.length; i += 6) {
    const [y, link, size, mtime, name, target] = fields.slice(i, i + 6);
    const type = TYPE_BY_CHAR[y] ?? "other";
    const seconds = Number.parseFloat(mtime);
    entries.push({
      name,
      type,
      size: Number.parseInt(size, 10) || 0,
      modified: Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null,
      target: type === "link" ? target : null,
      linkTo: type === "link" ? (link === "d" ? "dir" : link === "f" ? "file" : "broken") : null,
    });
  }
  const truncated = entries.length > LIST_LIMIT;
  const shown = truncated ? entries.slice(0, LIST_LIMIT) : entries;
  shown.sort((a, b) => {
    const rank = (e: FileEntry) => (e.type === "dir" || e.linkTo === "dir" ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
  });
  return { entries: shown, truncated };
}

export async function listDir(session: FileSession, root: string, rawPath: string): Promise<DirListing> {
  const scope = rules(() => scopeOf(rawPath));
  const out = await run(session, SCRIPTS.list, [root, scope.path]);
  return {
    path: scope.path,
    scope: { area: scope.area, writable: scope.writable, temporary: scope.temporary },
    ...parseListing(out),
  };
}

export type FileContent = {
  path: string;
  size: number;
  /** Contains NUL bytes or is not UTF-8. `content` is then null. */
  binary: boolean;
  /** Only the first READ_LIMIT bytes are returned. */
  truncated: boolean;
  content: string | null;
  /** True under current/, where edits do not survive a deploy. */
  temporary: boolean;
  writable: boolean;
};

/** Split the `<size>\n<base64>` output the read and download scripts print. */
function splitSized(out: string): { size: number; data: Buffer } {
  const nl = out.indexOf("\n");
  if (nl < 0) throw new HttpError(502, "Your container returned an unexpected answer.", "upstream");
  const size = Number.parseInt(out.slice(0, nl), 10);
  return { size: Number.isFinite(size) ? size : 0, data: Buffer.from(out.slice(nl + 1), "base64") };
}

/** UTF-8 text from `bytes`, or null. A cut-off final character is dropped. */
export function decodeText(bytes: Buffer, cut: boolean): string | null {
  if (bytes.includes(0)) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const tries = cut ? 4 : 1;
  for (let drop = 0; drop < tries; drop++) {
    try {
      return decoder.decode(bytes.subarray(0, bytes.length - drop));
    } catch {
      /* try again with fewer trailing bytes */
    }
  }
  return null;
}

export async function readFile(session: FileSession, root: string, rawPath: string): Promise<FileContent> {
  const scope = rules(() => scopeOf(rawPath));
  const out = await run(session, SCRIPTS.read, [root, scope.path, String(READ_LIMIT)]);
  const { size, data } = splitSized(out);
  const truncated = size > READ_LIMIT;
  const content = decodeText(data, truncated);
  return {
    path: scope.path,
    size,
    binary: content === null,
    truncated,
    content,
    temporary: scope.temporary,
    writable: scope.modifiable,
  };
}

export async function downloadFile(
  session: FileSession,
  root: string,
  rawPath: string
): Promise<{ name: string; bytes: Buffer }> {
  const scope = rules(() => scopeOf(rawPath));
  if (scope.path === "") throw new HttpError(400, "That path is not a file.", "not_a_file");
  const out = await run(session, SCRIPTS.download, [root, scope.path, String(DOWNLOAD_LIMIT)], {
    timeoutMs: 120_000,
  });
  return { name: baseName(scope.path), bytes: splitSized(out).data };
}

export type WriteResult = { path: string; temporary: boolean };

export async function writeFile(
  session: FileSession,
  root: string,
  rawPath: string,
  content: Buffer,
  overwrite: boolean
): Promise<WriteResult> {
  const scope = rules(() => assertModifiable(rawPath));
  if (content.length > UPLOAD_LIMIT) {
    throw new HttpError(413, "That file is over the 50 MB limit.", "too_large");
  }
  await run(session, SCRIPTS.write, [root, scope.path, overwrite ? "1" : "0"], {
    stdin: content,
    timeoutMs: 120_000,
  });
  return { path: scope.path, temporary: scope.temporary };
}

export async function makeDir(session: FileSession, root: string, rawPath: string): Promise<WriteResult> {
  const scope = rules(() => assertModifiable(rawPath));
  await run(session, SCRIPTS.mkdir, [root, scope.path]);
  return { path: scope.path, temporary: scope.temporary };
}

export async function renamePath(
  session: FileSession,
  root: string,
  rawFrom: string,
  rawTo: string
): Promise<{ from: string; to: string; temporary: boolean }> {
  const from = rules(() => assertModifiable(rawFrom));
  const to = rules(() => assertModifiable(rawTo));
  if (from.path === to.path) throw new HttpError(400, "That is the same path.", "bad_path");
  if (to.path.startsWith(`${from.path}/`)) {
    throw new HttpError(400, "A folder cannot move into itself.", "bad_path");
  }
  await run(session, SCRIPTS.rename, [root, from.path, to.path]);
  return { from: from.path, to: to.path, temporary: from.temporary || to.temporary };
}

export async function deletePath(
  session: FileSession,
  root: string,
  rawPath: string,
  recursive: boolean
): Promise<WriteResult> {
  const scope = rules(() => assertModifiable(rawPath));
  await run(session, SCRIPTS.delete, [root, scope.path, recursive ? "1" : "0"], { timeoutMs: 120_000 });
  return { path: scope.path, temporary: scope.temporary };
}

// ---------------------------------------------------------------------------
// Service layer used by the routes: ownership, a session, audit entries

type ProjectFilesCtx = { session: FileSession; root: string; projectId: string };

/** Turn transport failures into the API's error shape. */
function sshToHttp(err: unknown): never {
  if (err instanceof SshError) {
    throw new HttpError(502, err.message, `ssh_${err.kind}`);
  }
  throw err;
}

async function withProjectFiles<T>(
  userId: string,
  project: ProjectRow,
  fn: (ctx: ProjectFilesCtx) => Promise<T>
): Promise<T> {
  const server = await getServerForUser(userId, project.serverId);
  try {
    return await withServerSession(server, async (session) => {
      const home = (await run(session, SCRIPTS.home, [])).trim();
      if (!home.startsWith("/")) {
        throw new HttpError(502, "Could not find your home folder on the container.", "upstream");
      }
      return fn({ session, root: projectDir(home, project.slug), projectId: project.id });
    });
  } catch (err) {
    return sshToHttp(err);
  }
}

/**
 * Check ownership, then the path rules, and only then open a session. A bad
 * path never reaches the container.
 */
async function guarded<T>(
  userId: string,
  projectId: string,
  check: () => void,
  fn: (ctx: ProjectFilesCtx) => Promise<T>
): Promise<T> {
  const project = await getProjectForUser(userId, projectId);
  rules(check);
  return withProjectFiles(userId, project, fn);
}

export function listProjectDir(userId: string, projectId: string, path: string) {
  return guarded(userId, projectId, () => normalizePath(path), (c) => listDir(c.session, c.root, path));
}

export function readProjectFile(userId: string, projectId: string, path: string) {
  return guarded(userId, projectId, () => normalizePath(path), (c) => readFile(c.session, c.root, path));
}

export function downloadProjectFile(userId: string, projectId: string, path: string) {
  return guarded(userId, projectId, () => normalizePath(path), (c) => downloadFile(c.session, c.root, path));
}

/** Ownership and path rules for a write, without touching the container. */
export async function checkProjectWrite(userId: string, projectId: string, path: string) {
  await getProjectForUser(userId, projectId);
  rules(() => assertModifiable(path));
}

export function writeProjectFile(
  userId: string,
  projectId: string,
  path: string,
  content: Buffer,
  overwrite: boolean
) {
  return guarded(
    userId,
    projectId,
    () => assertModifiable(path),
    async (c) => {
      const res = await writeFile(c.session, c.root, path, content, overwrite);
      await audit(userId, "file.write", c.projectId, { path: res.path });
      return res;
    }
  );
}

export function makeProjectDir(userId: string, projectId: string, path: string) {
  return guarded(
    userId,
    projectId,
    () => assertModifiable(path),
    async (c) => {
      const res = await makeDir(c.session, c.root, path);
      await audit(userId, "file.mkdir", c.projectId, { path: res.path });
      return res;
    }
  );
}

export function renameProjectPath(userId: string, projectId: string, from: string, to: string) {
  return guarded(
    userId,
    projectId,
    () => {
      assertModifiable(from);
      assertModifiable(to);
    },
    async (c) => {
      const res = await renamePath(c.session, c.root, from, to);
      await audit(userId, "file.rename", c.projectId, { from: res.from, to: res.to });
      return res;
    }
  );
}

export function deleteProjectPath(userId: string, projectId: string, path: string, recursive: boolean) {
  return guarded(
    userId,
    projectId,
    () => assertModifiable(path),
    async (c) => {
      const res = await deletePath(c.session, c.root, path, recursive);
      await audit(userId, "file.delete", c.projectId, { path: res.path });
      return res;
    }
  );
}
