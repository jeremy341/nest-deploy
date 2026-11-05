import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_LIMIT,
  LIST_LIMIT,
  READ_LIMIT,
  SCRIPTS,
  buildCommand,
  decodeText,
  deletePath,
  downloadFile,
  listDir,
  makeDir,
  parseListing,
  readFile,
  renamePath,
  writeFile,
  type FileSession,
} from "@/server/files";
import { LIVE_RELEASE_MESSAGE } from "@/server/files-paths";
import { HttpError } from "@/server/http";
import { NestSession, shellQuote } from "@/server/ssh/connection";
import { generateServerKey } from "@/server/ssh/keys";
import { startMockSsh, wslEnabled, type MockSsh } from "@/server/test/mock-ssh";

const ROOT = "/home/sam/.nest-deploy/app";

function recorder(result = { code: 0, stdout: "", stderr: "" }) {
  const exec = vi.fn(async () => result);
  return { session: { exec } as FileSession, exec };
}

async function status(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    return { status: (e as HttpError).status, code: (e as HttpError).code };
  }
}

describe("command building", () => {
  it("quotes every argument and the script, so names cannot become shell syntax", () => {
    const evil = `shared/it's $(touch /tmp/x); \`id\` "q" \\ *.txt`;
    const cmd = buildCommand(SCRIPTS.read, [ROOT, evil, "1048576"]);
    expect(cmd.startsWith("bash -c '")).toBe(true);
    expect(cmd).toContain(` _ ${shellQuote(ROOT)} ${shellQuote(evil)} '1048576'`);
    // The evil name appears only in its quoted form.
    expect(cmd.split(evil).length).toBe(1);
    expect(cmd.endsWith(`${shellQuote(evil)} '1048576'`)).toBe(true);
  });

  it("never puts a path into the script text", async () => {
    const { session, exec } = recorder({ code: 0, stdout: "5\naGVsbG8=", stderr: "" });
    await readFile(session, ROOT, "shared/secret-name.txt");
    const [command] = exec.mock.calls[0] as unknown as [string];
    const script = command.slice("bash -c ".length, command.indexOf("' _ ") + 1);
    expect(script).toBe(shellQuote(SCRIPTS.read));
    expect(script).not.toContain("secret-name");
    expect(SCRIPTS.read).not.toContain("secret-name");
  });

  it("passes the content on stdin, not in the command", async () => {
    const { session, exec } = recorder();
    await writeFile(session, ROOT, "shared/a.txt", Buffer.from("TOP-SECRET-BODY"), true);
    const [command, opts] = exec.mock.calls[0] as unknown as [string, { stdin: Buffer }];
    expect(command).not.toContain("TOP-SECRET-BODY");
    expect(opts.stdin.toString()).toBe("TOP-SECRET-BODY");
  });
});

describe("bad paths never reach the container", () => {
  const traversal = ["../x", "shared/../../etc", "shared/..", "/etc/passwd", "shared//a", "a\0b", "x".repeat(2000)];

  it("rejects traversal in every operation", async () => {
    for (const path of traversal) {
      const { session, exec } = recorder();
      const results = await Promise.all([
        status(listDir(session, ROOT, path)),
        status(readFile(session, ROOT, path)),
        status(downloadFile(session, ROOT, path)),
        status(writeFile(session, ROOT, path, Buffer.from("x"), true)),
        status(makeDir(session, ROOT, path)),
        status(renamePath(session, ROOT, path, "shared/ok")),
        status(renamePath(session, ROOT, "shared/ok", path)),
        status(deletePath(session, ROOT, path, true)),
      ]);
      for (const r of results) expect(r, path).toMatchObject({ status: expect.any(Number) });
      for (const r of results) expect([400, 403]).toContain(r!.status);
      expect(exec, path).not.toHaveBeenCalled();
    }
  });

  it("refuses writes outside shared/ before any SSH call", async () => {
    for (const path of ["", "shared", "current", "current/a.js", "releases/abc/a", "incoming/x", "package.json"]) {
      const { session, exec } = recorder();
      expect(await status(writeFile(session, ROOT, path, Buffer.from("x"), true)), path).toMatchObject({
        status: 403,
        code: "read_only",
      });
      expect(await status(makeDir(session, ROOT, path))).toMatchObject({ status: 403 });
      expect(await status(deletePath(session, ROOT, path, true))).toMatchObject({ status: 403 });
      expect(await status(renamePath(session, ROOT, path, "shared/x"))).toMatchObject({ status: 403 });
      expect(exec).not.toHaveBeenCalled();
    }
  });

  it("refuses write, mkdir, rename and delete in current/ with the live release message, before any SSH call", async () => {
    const live = { status: 403, code: "read_only", message: LIVE_RELEASE_MESSAGE };
    const messageOf = async (p: Promise<unknown>) => {
      const err: unknown = await p.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpError);
      const http = err as HttpError;
      return { status: http.status, code: http.code, message: http.message };
    };
    for (const path of ["current/a.js", "current/deep/b.js", "current/.env"]) {
      const { session, exec } = recorder();
      expect(await messageOf(writeFile(session, ROOT, path, Buffer.from("x"), true)), path).toEqual(live);
      expect(await messageOf(makeDir(session, ROOT, path)), path).toEqual(live);
      expect(await messageOf(deletePath(session, ROOT, path, true)), path).toEqual(live);
      expect(await messageOf(renamePath(session, ROOT, path, "shared/x")), path).toEqual(live);
      expect(await messageOf(renamePath(session, ROOT, "shared/x", path)), path).toEqual(live);
      expect(exec, path).not.toHaveBeenCalled();
    }
  });

  it("refuses oversize uploads before any SSH call", async () => {
    const { session, exec } = recorder();
    const big = Buffer.alloc(DOWNLOAD_LIMIT + 1);
    expect(await status(writeFile(session, ROOT, "shared/big.bin", big, true))).toMatchObject({ status: 413 });
    expect(exec).not.toHaveBeenCalled();
  });

  it("refuses to move a folder into itself or onto itself", async () => {
    const { session, exec } = recorder();
    expect(await status(renamePath(session, ROOT, "shared/a", "shared/a/b"))).toMatchObject({ status: 400 });
    expect(await status(renamePath(session, ROOT, "shared/a", "shared/a"))).toMatchObject({ status: 400 });
    expect(exec).not.toHaveBeenCalled();
  });

  it("allows reading anywhere inside the project folder", async () => {
    const { session, exec } = recorder({ code: 0, stdout: "", stderr: "" });
    await listDir(session, ROOT, "");
    await listDir(session, ROOT, "releases");
    await listDir(session, ROOT, "current");
    expect(exec).toHaveBeenCalledTimes(3);
  });
});

describe("remote failures", () => {
  it("maps the container's exit codes to the API's error shape", async () => {
    const cases: [number, number, string][] = [
      [10, 404, "no_folder"],
      [20, 403, "outside_scope"],
      [21, 403, "read_only"],
      [30, 404, "not_found"],
      [33, 409, "not_a_folder"],
      [34, 409, "not_a_file"],
      [35, 413, "too_large"],
      [36, 409, "is_link"],
      [37, 409, "is_folder"],
      [38, 409, "exists"],
      [51, 502, "upstream"],
      [255, 502, "upstream"],
    ];
    for (const [code, httpStatus, name] of cases) {
      const { session } = recorder({ code, stdout: "", stderr: "secret details" });
      const err: unknown = await listDir(session, ROOT, "shared").catch((e: unknown) => e);
      expect(err, String(code)).toBeInstanceOf(HttpError);
      const http = err as HttpError;
      expect(http.status).toBe(httpStatus);
      expect(http.code).toBe(name);
      expect(http.message).not.toContain("secret details");
    }
  });
});

describe("parseListing", () => {
  const rec = (...f: (string | number)[]) => f.join("\0") + "\0";

  it("reads NUL separated records, including names with newlines, tabs and spaces", () => {
    const out =
      rec("f", "f", 12, "1730000000.5", "plain.txt", "") +
      rec("f", "f", 3, "1730000001.0", "two\nlines.txt", "") +
      rec("d", "d", 4096, "1730000002.0", "my folder", "") +
      rec("f", "f", 1, "1730000003.0", "tab\there", "");
    const { entries, truncated } = parseListing(out);
    expect(truncated).toBe(false);
    expect(entries.map((e) => e.name)).toEqual(["my folder", "plain.txt", "tab\there", "two\nlines.txt"]);
    expect(entries[1]).toMatchObject({ type: "file", size: 12, modified: new Date(1730000000500).toISOString() });
  });

  it("lists links with their target and what it points at", () => {
    const out =
      rec("l", "d", 8, "1.0", "current", "releases/r1") +
      rec("l", "N", 3, "1.0", "dead", "nowhere") +
      rec("l", "f", 3, "1.0", "alias", "a.txt") +
      rec("p", "p", 0, "1.0", "fifo", "");
    const byName = Object.fromEntries(parseListing(out).entries.map((e) => [e.name, e]));
    expect(byName.current).toMatchObject({ type: "link", target: "releases/r1", linkTo: "dir" });
    expect(byName.dead).toMatchObject({ type: "link", linkTo: "broken" });
    expect(byName.alias).toMatchObject({ type: "link", linkTo: "file" });
    expect(byName.fifo).toMatchObject({ type: "other", target: null });
  });

  it("puts folders first, sorts numerically and ignores case", () => {
    const out =
      rec("f", "f", 1, "1", "b10.txt", "") +
      rec("f", "f", 1, "1", "B2.txt", "") +
      rec("d", "d", 1, "1", "zeta", "") +
      rec("d", "d", 1, "1", "Alpha", "");
    expect(parseListing(out).entries.map((e) => e.name)).toEqual(["Alpha", "zeta", "B2.txt", "b10.txt"]);
  });

  it("caps the list and says so", () => {
    let out = "";
    for (let i = 0; i < LIST_LIMIT + 1; i++) out += rec("f", "f", 1, "1", `f${i}`, "");
    const { entries, truncated } = parseListing(out);
    expect(entries).toHaveLength(LIST_LIMIT);
    expect(truncated).toBe(true);
  });

  it("drops a half-written final record and survives empty output", () => {
    expect(parseListing("").entries).toEqual([]);
    expect(parseListing("f\0f\0").entries).toEqual([]);
  });
});

describe("decodeText", () => {
  it("returns text, and null for NUL bytes or invalid UTF-8", () => {
    expect(decodeText(Buffer.from("héllo ✓"), false)).toBe("héllo ✓");
    expect(decodeText(Buffer.from([0x68, 0x00, 0x69]), false)).toBeNull();
    expect(decodeText(Buffer.from([0xff, 0xfe, 0x41]), false)).toBeNull();
  });

  it("drops a character cut in half by the size cap", () => {
    const cut = Buffer.from("ab✓").subarray(0, 4); // "ab" + first 2 bytes of a 3 byte char
    expect(decodeText(cut, true)).toBe("ab");
    expect(decodeText(cut, false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The scripts against a real shell. Skipped where no Linux userland exists
// (Windows without WSL), because Git Bash cannot make real symlinks.

const hasLinux = process.platform !== "win32" || wslEnabled();

describe.skipIf(!hasLinux)("against a real shell", () => {
  let mock: MockSsh;
  let session: NestSession;
  let root: string;

  const sh = async (script: string) => {
    const r = await session.script(`cd "$HOME"\n${script}`, { timeoutMs: 20_000 });
    if (r.code !== 0) throw new Error(`setup failed: ${r.stderr}`);
    return r.stdout;
  };

  beforeAll(async () => {
    const key = generateServerKey("files-test");
    mock = await startMockSsh({ authorizedKeys: [key.publicKey] });
    session = await NestSession.connect({
      host: "127.0.0.1",
      port: mock.port,
      username: "sam",
      privateKey: key.privateKey,
    });
    root = `${mock.home}/.nest-deploy/app`;
    await sh(`
r=.nest-deploy/app
mkdir -p $r/releases/r1/src $r/shared/data $r/incoming
echo 'console.log(1)' > $r/releases/r1/index.js
ln -s releases/r1 $r/current
echo top-secret > "$HOME/outside.txt"
mkdir -p "$HOME/outside-dir" && echo secret2 > "$HOME/outside-dir/s.txt"
printf 'hello\\n' > "$r/shared/data/a.txt"
printf 'x' > "$r/shared/data/sp ace.txt"
printf 'x' > "$r/shared/data/new
line.txt"
printf 'x' > "$r/shared/data/it's.txt"
printf '\\000\\001\\002' > $r/shared/data/bin.dat
head -c 2200000 /dev/zero | tr '\\0' 'a' > $r/shared/data/big.txt
printf '\\377\\376latin' > $r/shared/data/latin.txt
printf 'run' > $r/shared/data/run.sh && chmod 755 $r/shared/data/run.sh
mkdir -p $r/shared/data/sub && echo nested > $r/shared/data/sub/n.txt
ln -s "$HOME/outside.txt" $r/shared/escape-file
ln -s "$HOME/outside-dir" $r/shared/escape-dir
ln -s data $r/shared/inside
ln -s ../releases $r/shared/to-releases
ln -s ../current $r/shared/to-current
ln -s nowhere $r/shared/dead
`);
  }, 60_000);

  afterAll(async () => {
    session?.close();
    await mock?.stop();
  });

  const exists = async (p: string) => (await session.exec(`test -e '${p}' || test -L '${p}'`)).code === 0;
  const text = async (p: string) => (await session.exec(`cat '${p}'`)).stdout;

  it("lists the project folder with links shown as links", async () => {
    const res = await listDir(session, root, "");
    expect(res.scope).toMatchObject({ area: "root", writable: false });
    const byName = Object.fromEntries(res.entries.map((e) => [e.name, e]));
    expect(Object.keys(byName).sort()).toEqual(["current", "incoming", "releases", "shared"]);
    expect(byName.current).toMatchObject({ type: "link", target: "releases/r1", linkTo: "dir" });
    expect(byName.shared.type).toBe("dir");
  });

  it("lists names with spaces, quotes and newlines intact", async () => {
    const res = await listDir(session, root, "shared/data");
    const names = res.entries.map((e) => e.name);
    expect(names).toContain("sp ace.txt");
    expect(names).toContain("new\nline.txt");
    expect(names).toContain("it's.txt");
    expect(res.entries[0].type).toBe("dir"); // sub/ first
    expect(res.entries.find((e) => e.name === "a.txt")).toMatchObject({ type: "file", size: 6 });
  });

  it("follows current into the release for reading, and reports it as the read-only live release", async () => {
    const res = await listDir(session, root, "current");
    expect(res.scope).toMatchObject({ area: "current", writable: false, liveRelease: true });
    expect(res.entries.map((e) => e.name)).toEqual(["src", "index.js"]);
    const file = await readFile(session, root, "current/index.js");
    expect(file).toMatchObject({ content: "console.log(1)" + String.fromCharCode(10), liveRelease: true, writable: false });
    expect((await downloadFile(session, root, "current/index.js")).name).toBe("index.js");
  });

  it("refuses to follow links out of the project folder", async () => {
    expect(await status(listDir(session, root, "shared/escape-dir"))).toMatchObject({ status: 403, code: "outside_scope" });
    expect(await status(readFile(session, root, "shared/escape-file"))).toMatchObject({ status: 403, code: "outside_scope" });
    expect(await status(readFile(session, root, "shared/escape-dir/s.txt"))).toMatchObject({ status: 403 });
    expect(await status(downloadFile(session, root, "shared/escape-file"))).toMatchObject({ status: 403 });
    expect(await status(writeFile(session, root, "shared/escape-dir/new.txt", Buffer.from("x"), true))).toMatchObject({ status: 403 });
    expect(await status(makeDir(session, root, "shared/escape-dir/d"))).toMatchObject({ status: 403 });
    expect(await status(deletePath(session, root, "shared/escape-dir/s.txt", false))).toMatchObject({ status: 403 });
    expect(await status(renamePath(session, root, "shared/escape-dir/s.txt", "shared/s.txt"))).toMatchObject({ status: 403 });
    expect(await exists(`${mock.home}/outside-dir/s.txt`)).toBe(true);
    expect(await exists(`${mock.home}/outside-dir/new.txt`)).toBe(false);
  });

  it("follows links that stay inside, but will not write into read-only folders through one", async () => {
    expect((await listDir(session, root, "shared/inside")).entries.length).toBeGreaterThan(3);
    expect((await readFile(session, root, "shared/inside/a.txt")).content).toBe("hello\n");
    expect(await status(writeFile(session, root, "shared/to-releases/x.txt", Buffer.from("x"), true))).toMatchObject({
      status: 403,
      code: "read_only",
    });
    expect(await exists(`${root}/releases/x.txt`)).toBe(false);
  });

  it("reports missing and wrong-type paths", async () => {
    expect(await status(listDir(session, root, "shared/nope"))).toMatchObject({ status: 404 });
    expect(await status(listDir(session, root, "shared/data/a.txt"))).toMatchObject({ status: 409, code: "not_a_folder" });
    expect(await status(readFile(session, root, "shared/data"))).toMatchObject({ status: 409, code: "not_a_file" });
    expect(await status(listDir(session, `${mock.home}/.nest-deploy/ghost`, ""))).toMatchObject({ status: 404, code: "no_folder" });
  });

  it("reads text, flags binary, and cuts at 1 MB", async () => {
    const ok = await readFile(session, root, "shared/data/a.txt");
    expect(ok).toMatchObject({ content: "hello\n", size: 6, binary: false, truncated: false, writable: true });

    const bin = await readFile(session, root, "shared/data/bin.dat");
    expect(bin).toMatchObject({ binary: true, content: null });
    const latin = await readFile(session, root, "shared/data/latin.txt");
    expect(latin.binary).toBe(true);

    const big = await readFile(session, root, "shared/data/big.txt");
    expect(big.truncated).toBe(true);
    expect(big.size).toBe(2200000);
    expect(big.content).toHaveLength(READ_LIMIT);
  });

  it("writes through a .partial file, with mode 644, and leaves nothing behind", async () => {
    const res = await writeFile(session, root, "shared/data/new.txt", Buffer.from("héllo\nwörld"), false);
    expect(res).toEqual({ path: "shared/data/new.txt" });
    expect(await text(`${root}/shared/data/new.txt`)).toBe("héllo\nwörld");
    expect((await session.exec(`stat -c %a '${root}/shared/data/new.txt'`)).stdout.trim()).toBe("644");
    expect(await exists(`${root}/shared/data/new.txt.partial`)).toBe(false);
  });

  it("refuses to replace without overwrite, and keeps an executable bit when it does", async () => {
    expect(await status(writeFile(session, root, "shared/data/a.txt", Buffer.from("z"), false))).toMatchObject({ status: 409, code: "exists" });
    expect(await text(`${root}/shared/data/a.txt`)).toBe("hello\n");

    await writeFile(session, root, "shared/data/run.sh", Buffer.from("run2"), true);
    expect(await text(`${root}/shared/data/run.sh`)).toBe("run2");
    expect((await session.exec(`stat -c %a '${root}/shared/data/run.sh'`)).stdout.trim()).toBe("755");
  });

  it("round-trips binary bytes through write and download", async () => {
    const bytes = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7) % 256));
    await writeFile(session, root, "shared/data/blob.bin", bytes, false);
    const got = await downloadFile(session, root, "shared/data/blob.bin");
    expect(got.name).toBe("blob.bin");
    expect(Buffer.compare(got.bytes, bytes)).toBe(0);
    expect(await writeFile(session, root, "shared/data/empty", Buffer.alloc(0), false)).toBeTruthy();
    expect((await downloadFile(session, root, "shared/data/empty")).bytes).toHaveLength(0);
  });

  it("will not write over a folder or through a link", async () => {
    expect(await status(writeFile(session, root, "shared/data/sub", Buffer.from("x"), true))).toMatchObject({ status: 409, code: "is_folder" });
    expect(await status(writeFile(session, root, "shared/dead", Buffer.from("x"), true))).toMatchObject({ status: 409, code: "is_link" });
    expect(await status(writeFile(session, root, "shared/escape-file", Buffer.from("x"), true))).toMatchObject({ status: 409, code: "is_link" });
    expect((await session.exec(`cat '${mock.home}/outside.txt'`)).stdout).toBe("top-secret\n");
  });

  it("refuses to write, create, rename or delete in current/, and leaves the live release alone", async () => {
    expect(await status(writeFile(session, root, "current/patched.txt", Buffer.from("tmp"), false))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(writeFile(session, root, "current/index.js", Buffer.from("evil"), true))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(makeDir(session, root, "current/newdir"))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(deletePath(session, root, "current/index.js", false))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(renamePath(session, root, "current/index.js", "shared/index.js"))).toMatchObject({ status: 403, code: "read_only" });
    expect(await exists(`${root}/releases/r1/patched.txt`)).toBe(false);
    expect(await exists(`${root}/releases/r1/newdir`)).toBe(false);
    expect(await text(`${root}/releases/r1/index.js`)).toBe("console.log(1)" + String.fromCharCode(10));
  });

  it("refuses on the container too: the scripts allow shared/ only, even if the path rules were bypassed", async () => {
    const run = (script: string, args: string[], stdin?: Buffer) => session.exec(buildCommand(script, [root, ...args]), { stdin });
    // Exit 21 is "read only". A release folder is where current/ points.
    expect((await run(SCRIPTS.write, ["current/patched.txt", "0"], Buffer.from("x"))).code).toBe(21);
    expect((await run(SCRIPTS.write, ["releases/r1/patched.txt", "0"], Buffer.from("x"))).code).toBe(21);
    expect((await run(SCRIPTS.mkdir, ["current/newdir"])).code).toBe(21);
    expect((await run(SCRIPTS.delete, ["current/index.js", "0"])).code).toBe(21);
    expect((await run(SCRIPTS.rename, ["current/index.js", "shared/index.js"])).code).toBe(21);
    expect((await run(SCRIPTS.rename, ["shared/data/a.txt", "current/a.txt"])).code).toBe(21);
    // And the shared/ control still passes.
    expect((await run(SCRIPTS.mkdir, ["shared/data/script-ok"])).code).toBe(0);
    expect(await exists(`${root}/releases/r1/patched.txt`)).toBe(false);
    expect(await exists(`${root}/releases/r1/newdir`)).toBe(false);
    expect(await exists(`${root}/releases/r1/index.js`)).toBe(true);
  });

  it("will not reach the live release through a link in shared/", async () => {
    expect(await status(writeFile(session, root, "shared/to-current/patched.txt", Buffer.from("x"), true))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(makeDir(session, root, "shared/to-current/newdir"))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(deletePath(session, root, "shared/to-current/index.js", false))).toMatchObject({ status: 403, code: "read_only" });
    expect(await status(renamePath(session, root, "shared/data/a.txt", "shared/to-current/a.txt"))).toMatchObject({ status: 403, code: "read_only" });
    expect(await exists(`${root}/releases/r1/patched.txt`)).toBe(false);
    expect(await exists(`${root}/releases/r1/index.js`)).toBe(true);
  });

  it("will not write when the parent folder is missing", async () => {
    expect(await status(writeFile(session, root, "shared/missing/x.txt", Buffer.from("x"), false))).toMatchObject({ status: 404 });
  });

  it("treats shell metacharacters in names as plain text", async () => {
    const names = ["$(touch PWNED1)", "; touch PWNED2", "`touch PWNED3`", "a'b\"c", "*", "-rf", "new\nline"];
    for (const n of names) {
      await writeFile(session, root, `shared/data/${n}`, Buffer.from("x"), false);
    }
    const listed = (await listDir(session, root, "shared/data")).entries.map((e) => e.name);
    for (const n of names) expect(listed).toContain(n);
    expect(await exists(`${mock.home}/PWNED1`)).toBe(false);
    expect(await exists(`${mock.home}/PWNED2`)).toBe(false);
    expect(await exists(`${mock.home}/PWNED3`)).toBe(false);
    // A glob in a name deletes only that name.
    await deletePath(session, root, "shared/data/*", false);
    const after = (await listDir(session, root, "shared/data")).entries.map((e) => e.name);
    expect(after).not.toContain("*");
    expect(after).toContain("a.txt");
  });

  it("creates folders, and refuses duplicates", async () => {
    expect(await makeDir(session, root, "shared/data/fresh")).toMatchObject({ path: "shared/data/fresh" });
    expect(await status(makeDir(session, root, "shared/data/fresh"))).toMatchObject({ status: 409, code: "exists" });
    expect(await status(makeDir(session, root, "shared/data/a.txt"))).toMatchObject({ status: 409 });
    expect(await status(makeDir(session, root, "shared/no/deeper"))).toMatchObject({ status: 404 });
  });

  it("renames and moves inside the writable area, never onto something", async () => {
    await writeFile(session, root, "shared/data/mv.txt", Buffer.from("m"), false);
    await renamePath(session, root, "shared/data/mv.txt", "shared/data/sub/moved.txt");
    expect(await text(`${root}/shared/data/sub/moved.txt`)).toBe("m");
    expect(await status(renamePath(session, root, "shared/data/sub/moved.txt", "shared/data/a.txt"))).toMatchObject({ status: 409, code: "exists" });
    expect(await status(renamePath(session, root, "shared/data/ghost", "shared/data/g2"))).toMatchObject({ status: 404 });
    // Moving into the live release is refused, and the file stays where it was.
    expect(await status(renamePath(session, root, "shared/data/sub/moved.txt", "current/moved.txt"))).toMatchObject({ status: 403, code: "read_only" });
    expect(await exists(`${root}/releases/r1/moved.txt`)).toBe(false);
    expect(await exists(`${root}/shared/data/sub/moved.txt`)).toBe(true);
  });

  it("renaming a link moves the link, not what it points at", async () => {
    await renamePath(session, root, "shared/escape-file", "shared/renamed-link");
    expect(await exists(`${root}/shared/renamed-link`)).toBe(true);
    expect(await exists(`${root}/shared/escape-file`)).toBe(false);
    expect((await session.exec(`cat '${mock.home}/outside.txt'`)).stdout).toBe("top-secret\n");
  });

  it("deletes files, needs the recursive flag for folders, and removes links without touching their target", async () => {
    await deletePath(session, root, "shared/data/it's.txt", false);
    expect(await exists(`${root}/shared/data/it's.txt`)).toBe(false);

    expect(await status(deletePath(session, root, "shared/data/sub", false))).toMatchObject({ status: 409, code: "is_folder" });
    expect(await exists(`${root}/shared/data/sub/n.txt`)).toBe(true);
    await deletePath(session, root, "shared/data/sub", true);
    expect(await exists(`${root}/shared/data/sub`)).toBe(false);

    await deletePath(session, root, "shared/escape-dir", true);
    expect(await exists(`${root}/shared/escape-dir`)).toBe(false);
    expect(await exists(`${mock.home}/outside-dir/s.txt`)).toBe(true);

    expect(await status(deletePath(session, root, "shared/data/ghost", false))).toMatchObject({ status: 404 });
  });

  it("cannot delete or rename the fixtures of the layout", async () => {
    for (const p of ["shared", "current", "releases", ""]) {
      expect(await status(deletePath(session, root, p, true))).toMatchObject({ status: 403 });
    }
    expect(await exists(`${root}/shared`)).toBe(true);
    expect(await exists(`${root}/releases/r1/index.js`)).toBe(true);
  });

  it("refuses downloads over the 50 MB cap", async () => {
    await sh(`truncate -s ${DOWNLOAD_LIMIT + 1} .nest-deploy/app/shared/huge.bin`);
    expect(await status(downloadFile(session, root, "shared/huge.bin"))).toMatchObject({ status: 413, code: "too_large" });
  });
});
