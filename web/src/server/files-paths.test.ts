import { describe, expect, it } from "vitest";
import {
  LIVE_RELEASE_MESSAGE,
  PathError,
  assertModifiable,
  assertSimpleName,
  baseName,
  isInsideRoot,
  isWritableReal,
  joinPath,
  normalizePath,
  parentPath,
  scopeOf,
} from "@/server/files-paths";

describe("normalizePath", () => {
  it("accepts and tidies relative paths", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("shared")).toBe("shared");
    expect(normalizePath("shared/a/b.txt")).toBe("shared/a/b.txt");
    expect(normalizePath("./shared/./a")).toBe("shared/a");
    expect(normalizePath(".")).toBe("");
    expect(normalizePath("shared/my file (1).txt")).toBe("shared/my file (1).txt");
    expect(normalizePath("shared/line\nbreak")).toBe("shared/line\nbreak");
  });

  it("rejects NUL bytes", () => {
    expect(() => normalizePath("shared/a\0b")).toThrow(PathError);
    expect(() => normalizePath("\0")).toThrow(/NUL/);
  });

  it("rejects .. segments however they are written", () => {
    for (const bad of ["..", "../x", "shared/..", "shared/../x", "shared/a/../../..", "a/b/..", "./.."]) {
      expect(() => normalizePath(bad), bad).toThrow(/\.\./);
    }
  });

  it("keeps names that merely contain dots", () => {
    expect(normalizePath("shared/..hidden")).toBe("shared/..hidden");
    expect(normalizePath("shared/a..b")).toBe("shared/a..b");
    expect(normalizePath("shared/...")).toBe("shared/...");
  });

  it("rejects absolute paths", () => {
    for (const bad of ["/", "/etc/passwd", "/shared", "//shared"]) {
      expect(() => normalizePath(bad), bad).toThrow(PathError);
    }
  });

  it("rejects empty segments and trailing slashes", () => {
    for (const bad of ["shared//a", "shared/", "a//", "shared/a/"]) {
      expect(() => normalizePath(bad), bad).toThrow(/empty segment/);
    }
  });

  it("rejects paths longer than 1024 characters, accepts exactly 1024", () => {
    const base = "a/".repeat(511); // 1022 characters
    expect(normalizePath(`${base}bb`)).toBe(`${base}bb`); // 1024
    expect(() => normalizePath(`${base}bbb`)).toThrow(/1024/); // 1025
    expect(() => normalizePath("x".repeat(5000))).toThrow(/1024/);
  });

  it("rejects a single name over 255 bytes", () => {
    expect(() => normalizePath(`shared/${"x".repeat(256)}`)).toThrow(/255/);
    expect(() => normalizePath(`shared/${"é".repeat(128)}`)).toThrow(/255/);
    expect(normalizePath(`shared/${"x".repeat(255)}`)).toHaveLength(7 + 255);
  });

  it("rejects non-strings", () => {
    for (const bad of [undefined, null, 5, {}, ["shared"]]) {
      expect(() => normalizePath(bad)).toThrow(PathError);
    }
  });

  it("reports bad paths as 400 with a stable code", () => {
    try {
      normalizePath("../x");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PathError);
      expect((e as PathError).status).toBe(400);
      expect((e as PathError).code).toBe("bad_path");
    }
  });
});

describe("scopeOf", () => {
  it("treats shared as the only writable area", () => {
    expect(scopeOf("shared")).toMatchObject({ area: "shared", writable: true, modifiable: false, liveRelease: false });
    expect(scopeOf("shared/data")).toMatchObject({ area: "shared", writable: true, modifiable: true, liveRelease: false });
    expect(scopeOf("shared/data/x.db")).toMatchObject({ modifiable: true, liveRelease: false, depth: 3 });
  });

  it("treats current, the live release, as read only", () => {
    expect(scopeOf("current")).toMatchObject({ area: "current", writable: false, modifiable: false, liveRelease: true });
    expect(scopeOf("current/.env")).toMatchObject({ area: "current", writable: false, modifiable: false, liveRelease: true });
    expect(scopeOf("current/a/b/c.js")).toMatchObject({ writable: false, modifiable: false, liveRelease: true });
  });

  it("treats everything else as read only", () => {
    expect(scopeOf("")).toMatchObject({ area: "root", writable: false, modifiable: false });
    expect(scopeOf("releases")).toMatchObject({ area: "releases", writable: false });
    expect(scopeOf("releases/abc/index.js")).toMatchObject({ area: "releases", writable: false, modifiable: false });
    expect(scopeOf("incoming/x.tar.gz")).toMatchObject({ area: "incoming", modifiable: false });
    expect(scopeOf("notes.txt")).toMatchObject({ area: "other", modifiable: false });
  });

  it("is case sensitive and does not match look-alikes", () => {
    expect(scopeOf("Shared/x").modifiable).toBe(false);
    expect(scopeOf("shared2/x").modifiable).toBe(false);
    expect(scopeOf("currently/x").modifiable).toBe(false);
  });

  it("refuses to describe a path that fails the path rules", () => {
    expect(() => scopeOf("shared/../releases")).toThrow(PathError);
    expect(() => scopeOf("/etc")).toThrow(PathError);
  });
});

describe("assertModifiable", () => {
  it("allows files and folders inside shared", () => {
    expect(assertModifiable("shared/a").path).toBe("shared/a");
    expect(assertModifiable("shared/a/b").liveRelease).toBe(false);
  });

  it("refuses everything inside current/ with 403 read_only and a message about the live release", () => {
    for (const bad of ["current", "current/a", "current/a/b/c.js", "current/.env", "current/shared"]) {
      try {
        assertModifiable(bad);
        expect.unreachable(bad);
      } catch (e) {
        expect(e, bad).toBeInstanceOf(PathError);
        expect((e as PathError).status).toBe(403);
        expect((e as PathError).code).toBe("read_only");
        expect((e as PathError).message).toBe(LIVE_RELEASE_MESSAGE);
      }
    }
    expect(LIVE_RELEASE_MESSAGE).toMatch(/live release/);
    expect(LIVE_RELEASE_MESSAGE).toMatch(/read only/);
  });

  it("does not let traversal reach current/ from shared/", () => {
    expect(() => assertModifiable("shared/../current/a")).toThrow(/\.\./);
  });

  it("refuses the fixtures, read-only areas and anything outside", () => {
    for (const bad of ["", "shared", "current", "releases/x", "incoming/x", "other"]) {
      try {
        assertModifiable(bad);
        expect.unreachable(bad);
      } catch (e) {
        expect(e, bad).toBeInstanceOf(PathError);
        expect((e as PathError).status).toBe(403);
        expect((e as PathError).code).toBe("read_only");
      }
    }
    expect(() => assertModifiable("shared/../releases/x")).toThrow(/\.\./);
    expect(() => assertModifiable("/etc/passwd")).toThrow(PathError);
  });
});

describe("path helpers", () => {
  it("splits and joins", () => {
    expect(parentPath("shared/a/b")).toBe("shared/a");
    expect(parentPath("shared")).toBe("");
    expect(baseName("shared/a/b.txt")).toBe("b.txt");
    expect(baseName("shared")).toBe("shared");
    expect(joinPath("", "shared")).toBe("shared");
    expect(joinPath("shared", "a")).toBe("shared/a");
  });

  it("accepts one plain name for rename and new folder", () => {
    expect(assertSimpleName("notes.txt")).toBe("notes.txt");
    for (const bad of ["", "  ", "a/b", ".", "..", "x\0y"]) {
      expect(() => assertSimpleName(bad), JSON.stringify(bad)).toThrow(PathError);
    }
  });
});

describe("symlink containment on resolved paths", () => {
  const root = "/home/sam/.nest-deploy/app";

  it("accepts the root and anything inside", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, `${root}/shared/data`)).toBe(true);
    expect(isInsideRoot(`${root}/`, `${root}/shared`)).toBe(true);
  });

  it("refuses links that resolve outside, including look-alike prefixes", () => {
    expect(isInsideRoot(root, "/etc/passwd")).toBe(false);
    expect(isInsideRoot(root, "/home/sam/.nest-deploy")).toBe(false);
    expect(isInsideRoot(root, "/home/sam/.nest-deploy/app-evil")).toBe(false);
    expect(isInsideRoot(root, "/home/sam/.nest-deploy/app2/shared")).toBe(false);
    expect(isInsideRoot(root, "/")).toBe(false);
  });

  it("allows writes only to shared once links are resolved", () => {
    expect(isWritableReal(root, `${root}/shared`)).toBe(true);
    expect(isWritableReal(root, `${root}/shared/x/y`)).toBe(true);
    // current/ is a link to a release folder: the live code can never be a write target.
    expect(isWritableReal(root, `${root}/releases/abc`)).toBe(false);
    expect(isWritableReal(root, `${root}/releases/abc/src/a.js`)).toBe(false);
    // A link in shared/ that points at these must not become a way to write there.
    expect(isWritableReal(root, root)).toBe(false);
    expect(isWritableReal(root, `${root}/releases`)).toBe(false);
    expect(isWritableReal(root, `${root}/releases/`)).toBe(false);
    expect(isWritableReal(root, `${root}/incoming`)).toBe(false);
    expect(isWritableReal(root, `${root}/current`)).toBe(false);
    expect(isWritableReal(root, `${root}/shared-evil/x`)).toBe(false);
    expect(isWritableReal(root, "/etc")).toBe(false);
  });
});
