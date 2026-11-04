/**
 * Where things live inside a Nest container, and what they are called.
 * Everything sits under one folder so removing Nest Deploy is one `rm -rf`
 * plus deleting the nd-*.service units.
 */

export const DEFAULT_UNIT_DIR = "/etc/systemd/system";
export const KEEP_RELEASES = 5;
export const KEEP_PREVIEWS = 2;

export function baseDir(home: string) {
  return `${home.replace(/\/$/, "")}/.nest-deploy`;
}

export function projectDir(home: string, slug: string) {
  return `${baseDir(home)}/${slug}`;
}

export function releaseDir(home: string, slug: string, releaseId: string) {
  return `${projectDir(home, slug)}/releases/${releaseId}`;
}

export function incomingArchive(home: string, slug: string, releaseId: string) {
  return `${projectDir(home, slug)}/incoming/${releaseId}.tar.gz`;
}

export function currentLink(home: string, slug: string) {
  return `${projectDir(home, slug)}/current`;
}

export function sharedDir(home: string, slug: string) {
  return `${projectDir(home, slug)}/shared`;
}

/** systemd unit name. Production is nd-<slug>, previews add a short suffix. */
export function unitName(slug: string, preview?: { releaseId: string }) {
  return preview
    ? `nd-${slug}-pv-${preview.releaseId.slice(0, 8)}.service`
    : `nd-${slug}.service`;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidSlug(slug: string) {
  return SLUG.test(slug);
}

export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "project";
}

/** Release ids are UUIDs: safe in paths and easy to recognise when pruning. */
export const RELEASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
