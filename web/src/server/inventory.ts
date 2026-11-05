import { and, eq, inArray } from "drizzle-orm";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { getDb, schema } from "@/server/db";
import { isValidSlug } from "@/server/deploy/layout";
import { HttpError } from "@/server/http";
import { getServerForUser, withServerSession } from "@/server/servers";
import { SshError } from "@/server/ssh/connection";
import {
  InventoryParseError,
  REMOVE_EXIT,
  inventoryScript,
  parseInventory,
  removeFolderScript,
  removeUnitScript,
  type InventoryUnit,
  type ListeningPort,
  type RawInventory,
  type UnitState,
} from "@/server/ssh/inventory-probe";

/**
 * What is on a Nest container, set against what Nest Deploy knows. The pure
 * functions here (classify, portConflicts, parseOrphanId) take plain data, so
 * they are tested without a container or a database.
 */

export type ProjectInfo = { id: string; slug: string; name: string; port: number };
export type PreviewInfo = { projectId: string; releaseId: string; port: number; branch: string };

export type PortOwner =
  | { type: "project"; projectId: string; slug: string }
  | { type: "preview"; projectId: string; slug: string }
  | { type: "orphan"; unit: string }
  | { type: "other" };

export type ClassifiedPort = {
  port: number;
  addresses: string[];
  process: string | null;
  pid: number | null;
  owner: PortOwner;
};

export type ServiceInfo = {
  unit: string;
  state: UnitState;
  detail: string | null;
  unitFile: string | null;
  execStart: string | null;
};

export type PreviewEntry = ServiceInfo & { branch: string; port: number };

export type ProjectEntry = {
  projectId: string;
  slug: string;
  name: string;
  port: number;
  /** Null when no unit for this project exists on the container. */
  service: ServiceInfo | null;
  folderKb: number | null;
  /** What the project's port is doing: its own service, free, or held by something else. */
  portStatus: "own" | "free" | "clash";
  previews: PreviewEntry[];
};

export type OrphanEntry = {
  /** What to send to the cleanup route: the unit name for a service, the folder name for a folder. */
  id: string;
  kind: "service" | "preview" | "folder";
  /** The slug the leftover belongs to. */
  slug: string;
  state: UnitState | null;
  detail: string | null;
  unitFile: string | null;
  execStart: string | null;
  sizeKb: number | null;
  /** Ports this orphan is listening on. */
  ports: number[];
  /** False for a link, which Nest Deploy never removes. */
  removable: boolean;
};

export type OtherPort = {
  port: number;
  addresses: string[];
  process: string | null;
  pid: number | null;
};

export type PortConflict = {
  projectId: string;
  slug: string;
  name: string;
  port: number;
  heldBy: { kind: PortOwner["type"]; label: string; pid: number | null };
};

export type Inventory = {
  serverId: string;
  serverName: string;
  checkedAt: string;
  disk: { totalMb: number; usedMb: number } | null;
  /** False when ports could not be listed at all. */
  portsKnown: boolean;
  /** False when the listing had no process names, so ownership is a best guess. */
  portsHaveProcesses: boolean;
  hasSystemctl: boolean;
  projects: ProjectEntry[];
  orphans: OrphanEntry[];
  otherPorts: OtherPort[];
  ports: ClassifiedPort[];
  conflicts: PortConflict[];
};

const PREVIEW_UNIT = /^nd-(.+)-pv-([0-9a-f]{8})\.service$/;

/** A unit name Nest Deploy could have written. Strict: no slashes, no dots but the suffix. */
export const UNIT_NAME = /^nd-[a-z0-9]+(?:-[a-z0-9]+)*\.service$/;

export type OrphanTarget =
  | { kind: "unit"; unit: string }
  | { kind: "folder"; name: string };

/**
 * Decide whether an id from the cleanup request is a unit name or a folder
 * name, or neither. A unit ends in `.service`; a folder is a project slug, which
 * can never contain a dot, so the two cannot be mistaken for each other.
 */
export function parseOrphanId(id: unknown): OrphanTarget | null {
  if (typeof id !== "string" || id.length === 0 || id.length > 100) return null;
  if (id.endsWith(".service")) return UNIT_NAME.test(id) ? { kind: "unit", unit: id } : null;
  return isValidSlug(id) ? { kind: "folder", name: id } : null;
}

function service(u: InventoryUnit): ServiceInfo {
  return {
    unit: u.name,
    state: u.state,
    detail: u.detail,
    unitFile: u.unitFile,
    execStart: u.execStart,
  };
}

/** Which unit does a listening process belong to? By pid, then by cgroup. */
function unitOf(port: ListeningPort, units: InventoryUnit[]): InventoryUnit | null {
  if (port.pid === null) return null;
  for (const u of units) {
    if (u.mainPid !== null && u.mainPid === port.pid) return u;
    const cg = u.controlGroup;
    if (cg && port.cgroups.some((g) => g === cg || g.startsWith(`${cg}/`))) return u;
  }
  return null;
}

type UnitClass =
  | { type: "project"; project: ProjectInfo }
  | { type: "preview"; project: ProjectInfo; preview: PreviewInfo }
  | { type: "orphan"; preview: boolean; slug: string };

function classifyUnit(
  name: string,
  projects: ProjectInfo[],
  previews: PreviewInfo[]
): UnitClass {
  const production = projects.find((p) => `nd-${p.slug}.service` === name);
  if (production) return { type: "project", project: production };

  const m = PREVIEW_UNIT.exec(name);
  if (m) {
    const project = projects.find((p) => p.slug === m[1]);
    if (project) {
      const preview = previews.find(
        (pv) => pv.projectId === project.id && pv.releaseId.slice(0, 8) === m[2]
      );
      if (preview) return { type: "preview", project, preview };
      return { type: "orphan", preview: true, slug: m[1] };
    }
    return { type: "orphan", preview: true, slug: m[1] };
  }
  return { type: "orphan", preview: false, slug: name.slice(3, -".service".length) };
}

export function classifyInventory(
  raw: RawInventory,
  projects: ProjectInfo[],
  previews: PreviewInfo[],
  server: { id: string; name: string },
  now = new Date()
): Inventory {
  const classes = new Map(raw.units.map((u) => [u.name, classifyUnit(u.name, projects, previews)]));
  const unitByName = new Map(raw.units.map((u) => [u.name, u]));

  // Ports: who holds each one.
  const ports: ClassifiedPort[] = raw.ports.map((p) => {
    const base = { port: p.port, addresses: p.addresses, process: p.process, pid: p.pid };
    const unit = unitOf(p, raw.units);
    if (unit) {
      const c = classes.get(unit.name)!;
      if (c.type === "project") {
        return { ...base, owner: { type: "project", projectId: c.project.id, slug: c.project.slug } };
      }
      if (c.type === "preview") {
        return { ...base, owner: { type: "preview", projectId: c.project.id, slug: c.project.slug } };
      }
      return { ...base, owner: { type: "orphan", unit: unit.name } };
    }
    const wanted = projects.find((pr) => pr.port === p.port);
    if (wanted) {
      // Without a process name we cannot tell whose it is. If the project's own
      // service is up, assume it is that service rather than cry wolf.
      const own = unitByName.get(`nd-${wanted.slug}.service`);
      const up = own && (own.state === "running" || own.state === "starting");
      if (up && p.pid === null) {
        return { ...base, owner: { type: "project", projectId: wanted.id, slug: wanted.slug } };
      }
    }
    return { ...base, owner: { type: "other" } };
  });

  const conflicts = portConflicts(projects, { ports });

  const folderBySlug = new Map(raw.folders.map((f) => [f.name, f]));
  const projectEntries: ProjectEntry[] = projects.map((p) => {
    const unit = unitByName.get(`nd-${p.slug}.service`) ?? null;
    const listening = ports.find((x) => x.port === p.port);
    const portStatus: ProjectEntry["portStatus"] = !listening
      ? "free"
      : conflicts.some((c) => c.projectId === p.id)
        ? "clash"
        : "own";
    const previewEntries: PreviewEntry[] = [];
    for (const [name, c] of classes) {
      if (c.type !== "preview" || c.project.id !== p.id) continue;
      previewEntries.push({
        ...service(unitByName.get(name)!),
        branch: c.preview.branch,
        port: c.preview.port,
      });
    }
    return {
      projectId: p.id,
      slug: p.slug,
      name: p.name,
      port: p.port,
      service: unit ? service(unit) : null,
      folderKb: folderBySlug.get(p.slug)?.sizeKb ?? null,
      portStatus,
      previews: previewEntries,
    };
  });

  const orphans: OrphanEntry[] = [];
  for (const [name, c] of classes) {
    if (c.type !== "orphan") continue;
    const u = unitByName.get(name)!;
    orphans.push({
      id: name,
      kind: c.preview ? "preview" : "service",
      slug: c.slug,
      state: u.state,
      detail: u.detail,
      unitFile: u.unitFile,
      execStart: u.execStart,
      sizeKb: null,
      ports: ports.filter((x) => x.owner.type === "orphan" && x.owner.unit === name).map((x) => x.port),
      removable: true,
    });
  }
  const slugs = new Set(projects.map((p) => p.slug));
  for (const f of raw.folders) {
    if (slugs.has(f.name) || !isValidSlug(f.name)) continue;
    orphans.push({
      id: f.name,
      kind: "folder",
      slug: f.name,
      state: null,
      detail: null,
      unitFile: null,
      execStart: null,
      sizeKb: f.sizeKb,
      ports: [],
      removable: !f.isLink,
    });
  }
  orphans.sort((a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind));

  const otherPorts: OtherPort[] = ports
    .filter((x) => x.owner.type === "other")
    .map(({ port, addresses, process, pid }) => ({ port, addresses, process, pid }));

  return {
    serverId: server.id,
    serverName: server.name,
    checkedAt: now.toISOString(),
    disk: raw.disk,
    portsKnown: raw.portsSource !== "none",
    portsHaveProcesses: raw.portsHaveProcesses,
    hasSystemctl: raw.hasSystemctl,
    projects: projectEntries,
    orphans,
    otherPorts,
    ports,
    conflicts,
  };
}

/**
 * Projects whose port is held by something that is not their own service.
 * `projects` may carry a port the user has not saved yet, so the settings page
 * can warn before the change is made.
 */
export function portConflicts(
  projects: ProjectInfo[],
  inventory: Pick<Inventory, "ports">
): PortConflict[] {
  const out: PortConflict[] = [];
  for (const p of projects) {
    for (const held of inventory.ports) {
      if (held.port !== p.port) continue;
      if (held.owner.type === "project" && held.owner.projectId === p.id) continue;
      const o = held.owner;
      const label =
        o.type === "orphan"
          ? o.unit
          : o.type === "project" || o.type === "preview"
            ? `nd-${o.slug}${o.type === "preview" ? " preview" : ""}`
            : (held.process ?? "another process");
      out.push({
        projectId: p.id,
        slug: p.slug,
        name: p.name,
        port: p.port,
        heldBy: { kind: o.type, label, pid: held.pid },
      });
      break;
    }
  }
  return out;
}

/** Turn a connection problem into something a person can act on, not a 500. */
function upstream(err: unknown): never {
  if (err instanceof SshError) {
    throw new HttpError(err.kind === "timeout" ? 504 : 502, err.message.replace(/\.$/, ""), "upstream");
  }
  if (err instanceof InventoryParseError) {
    throw new HttpError(502, err.message.replace(/\.$/, ""), "upstream");
  }
  throw err;
}

async function loadContext(userId: string, serverId: string) {
  const server = await getServerForUser(userId, serverId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.userId, userId), eq(schema.projects.serverId, server.id)));
  const projects: ProjectInfo[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    port: p.port,
  }));
  const deps = projects.length
    ? await db
        .select()
        .from(schema.deployments)
        .where(
          and(
            inArray(
              schema.deployments.projectId,
              projects.map((p) => p.id)
            ),
            eq(schema.deployments.env, "preview"),
            eq(schema.deployments.cleanedUp, false)
          )
        )
    : [];
  const previews: PreviewInfo[] = deps.map((d) => ({
    projectId: d.projectId,
    releaseId: d.releaseId,
    port: d.port,
    branch: d.branch,
  }));
  return { server, projects, previews };
}

function serverLabel(s: { nestUsername: string; host: string }) {
  return s.host === "hackclub.app" ? `${s.nestUsername}.hackclub.app` : s.host;
}

/** Read the container and classify it. Fails with a plain message when it cannot be reached. */
export async function getInventory(userId: string, serverId: string): Promise<Inventory> {
  const { server, projects, previews } = await loadContext(userId, serverId);
  let raw: RawInventory;
  try {
    raw = await withServerSession(server, async (s) => {
      const res = await s.script(inventoryScript(config().UNIT_DIR), { timeoutMs: 60_000 });
      return parseInventory(res.stdout);
    });
  } catch (err) {
    upstream(err);
  }
  return classifyInventory(raw, projects, previews, {
    id: server.id,
    name: serverLabel(server),
  });
}

export type OrphanResult = {
  id: string;
  status: "removed" | "gone" | "refused" | "failed";
  message: string | null;
};

export const MAX_ORPHANS_PER_REQUEST = 50;

/**
 * Remove orphaned services and folders. Every id is validated, then checked
 * against a fresh read of the container: only what is an orphan right now is
 * touched, so a service that belongs to a project is refused even if the
 * request names it. Returns one result per id; a failure on one does not stop
 * the others.
 */
export async function removeOrphans(
  userId: string,
  serverId: string,
  ids: string[]
): Promise<OrphanResult[]> {
  // Ownership first: a server that is not yours is a 404 whatever the ids are.
  const { server, projects, previews } = await loadContext(userId, serverId);
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new HttpError(400, "Choose something to remove.", "validation");
  if (unique.length > MAX_ORPHANS_PER_REQUEST) {
    throw new HttpError(400, `Remove at most ${MAX_ORPHANS_PER_REQUEST} items at a time.`, "validation");
  }

  const results = new Map<string, OrphanResult>();
  const targets = new Map<string, OrphanTarget>();
  for (const id of unique) {
    const t = parseOrphanId(id);
    if (!t) {
      results.set(id, { id, status: "refused", message: "That is not a Nest Deploy name." });
    } else {
      targets.set(id, t);
    }
  }

  const unitDir = config().UNIT_DIR;

  if (targets.size > 0) {
    try {
      await withServerSession(server, async (s) => {
        const read = await s.script(inventoryScript(unitDir), { timeoutMs: 60_000 });
        const inv = classifyInventory(parseInventory(read.stdout), projects, previews, {
          id: server.id,
          name: serverLabel(server),
        });
        const orphanIds = new Map(inv.orphans.map((o) => [o.id, o]));
        const managedUnits = new Set<string>();
        for (const p of inv.projects) {
          if (p.service) managedUnits.add(p.service.unit);
          for (const pv of p.previews) managedUnits.add(pv.unit);
        }
        const slugs = new Set(projects.map((p) => p.slug));

        for (const [id, t] of targets) {
          const name = t.kind === "unit" ? t.unit : t.name;
          const managed = t.kind === "unit" ? managedUnits.has(t.unit) : slugs.has(t.name);
          if (managed) {
            results.set(id, {
              id,
              status: "refused",
              message: "This belongs to one of your projects, so it was left alone.",
            });
            continue;
          }
          const orphan = orphanIds.get(id);
          if (!orphan) {
            results.set(id, {
              id,
              status: "gone",
              message: "It is no longer on the container.",
            });
            continue;
          }
          if (!orphan.removable) {
            results.set(id, {
              id,
              status: "refused",
              message: "This is a link, so it was left alone.",
            });
            continue;
          }

          const script =
            t.kind === "unit" ? removeUnitScript(unitDir, t.unit) : removeFolderScript(t.name);
          let result: OrphanResult;
          try {
            const res = await s.script(script, { timeoutMs: 120_000 });
            if (res.code === 0) result = { id, status: "removed", message: null };
            else if (res.code === REMOVE_EXIT.notFound) {
              result = { id, status: "gone", message: "It is no longer on the container." };
            } else if (res.code === REMOVE_EXIT.refused) {
              result = { id, status: "refused", message: res.stderr.trim() || "Left alone." };
            } else {
              result = {
                id,
                status: "failed",
                message: res.stderr.trim().slice(0, 200) || `Could not remove ${name}.`,
              };
            }
          } catch (err) {
            result = {
              id,
              status: "failed",
              message: err instanceof SshError ? err.message : `Could not remove ${name}.`,
            };
          }
          results.set(id, result);
          if (result.status === "removed") {
            // Name and kind only: never the contents of anything.
            await audit(userId, "container.orphan_remove", null, {
              server: server.nestUsername,
              kind: t.kind === "unit" ? "service" : "folder",
              name,
            });
          }
        }
      });
    } catch (err) {
      upstream(err);
    }
  }

  return unique.map((id) => results.get(id)!);
}
