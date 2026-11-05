import { describe, expect, it } from "vitest";
import {
  breadcrumbs,
  formatBytes,
  formatModified,
  isFolderLike,
  pageHref,
  renamedPath,
  typeLabel,
} from "@/components/file-manager-format";

describe("formatBytes", () => {
  it("scales and trims", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(52428800)).toBe("50 MB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(formatBytes(-1)).toBe("-");
  });
});

describe("formatModified", () => {
  it("leaves the year off for this year only", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(formatModified("2026-03-02T09:30:00Z", now)).not.toMatch(/2026/);
    expect(formatModified("2024-03-02T09:30:00Z", now)).toMatch(/2024/);
    expect(formatModified(null)).toBe("-");
    expect(formatModified("garbage")).toBe("-");
  });
});

describe("typeLabel and isFolderLike", () => {
  it("names each kind", () => {
    expect(typeLabel({ name: "a", type: "dir", linkTo: null })).toBe("Folder");
    expect(typeLabel({ name: "app.js", type: "file", linkTo: null })).toBe("JS file");
    expect(typeLabel({ name: "Makefile", type: "file", linkTo: null })).toBe("File");
    expect(typeLabel({ name: ".env", type: "file", linkTo: null })).toBe("File");
    expect(typeLabel({ name: "c", type: "link", linkTo: "dir" })).toBe("Link to folder");
    expect(typeLabel({ name: "c", type: "link", linkTo: "broken" })).toBe("Broken link");
    expect(typeLabel({ name: "c", type: "other", linkTo: null })).toBe("Special file");
  });

  it("opens folders and links to folders", () => {
    expect(isFolderLike({ type: "dir", linkTo: null })).toBe(true);
    expect(isFolderLike({ type: "link", linkTo: "dir" })).toBe(true);
    expect(isFolderLike({ type: "link", linkTo: "file" })).toBe(false);
    expect(isFolderLike({ type: "file", linkTo: null })).toBe(false);
  });
});

describe("paths in the page", () => {
  it("builds breadcrumbs from the project folder down", () => {
    expect(breadcrumbs("", "App")).toEqual([{ label: "App", path: "" }]);
    expect(breadcrumbs("shared/data/x", "App").map((c) => c.path)).toEqual(["", "shared", "shared/data", "shared/data/x"]);
  });

  it("builds addresses and renamed paths", () => {
    expect(pageHref("/projects/app/files", "")).toBe("/projects/app/files");
    expect(pageHref("/projects/app/files", "shared/my dir")).toBe("/projects/app/files?path=shared/my%20dir");
    expect(renamedPath("shared/a/b.txt", "c.txt")).toBe("shared/a/c.txt");
    expect(renamedPath("shared", "x")).toBe("x");
  });
});
