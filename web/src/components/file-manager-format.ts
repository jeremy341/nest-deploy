import { baseName, joinPath, parentPath } from "@/server/files-paths";
import type { FileEntry } from "@/server/files";

/** Shared by the page and its loading skeleton, so the two cannot drift apart. */
export const FM_GRID = "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]";

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}

export function formatModified(iso: string | null, now = new Date()): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** What a row is, in words, for the Type column and screen readers. */
export function typeLabel(entry: Pick<FileEntry, "name" | "type" | "linkTo">): string {
  if (entry.type === "dir") return "Folder";
  if (entry.type === "link") {
    if (entry.linkTo === "dir") return "Link to folder";
    if (entry.linkTo === "broken") return "Broken link";
    return "Link";
  }
  if (entry.type === "other") return "Special file";
  const dot = entry.name.lastIndexOf(".");
  return dot > 0 && dot < entry.name.length - 1 ? `${entry.name.slice(dot + 1).toUpperCase()} file` : "File";
}

/** A folder, or a link that leads to one. Opening it lists its contents. */
export function isFolderLike(entry: Pick<FileEntry, "type" | "linkTo">): boolean {
  return entry.type === "dir" || (entry.type === "link" && entry.linkTo === "dir");
}

/** One line on what each top-level folder of a project is for. */
export const TOP_LEVEL_HINTS: Record<string, string> = {
  shared: "Survives deploys. Keep uploads and databases here.",
  current: "The live release. Replaced on the next deploy.",
  releases: "Every deployed version, newest last.",
  incoming: "Archives on their way to a release.",
};

export type Crumb = { label: string; path: string };

export function breadcrumbs(path: string, projectName: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: projectName, path: "" }];
  if (path === "") return crumbs;
  let acc = "";
  for (const part of path.split("/")) {
    acc = joinPath(acc, part);
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function fileHref(projectId: string, kind: "download", path: string): string {
  return `/api/projects/${projectId}/files/${kind}?path=${encodeURIComponent(path)}`;
}

/** The address of the files page at `path`, for history and links. */
export function pageHref(basePath: string, path: string): string {
  return path === "" ? basePath : `${basePath}?path=${encodeURIComponent(path).replace(/%2F/g, "/")}`;
}

/** Where a name typed into Rename ends up: same folder, new last segment. */
export function renamedPath(path: string, newName: string): string {
  return joinPath(parentPath(path), newName);
}

/** A short title for dialogs and messages. */
export function displayName(path: string): string {
  return baseName(path);
}
