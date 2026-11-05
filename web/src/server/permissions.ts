import { and, eq } from "drizzle-orm";
import { audit } from "@/server/audit";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";

/**
 * Per-server container permissions. Each switch is an opt-out for one of the
 * container features. The server enforces them; the UI only hides what is off.
 *
 * Defaults: the terminal is OFF until the owner turns it on (it is a root shell),
 * file writes and leftover removal are ON (both are confirmed in the UI).
 */
export type ContainerPermission = "terminal" | "fileWrites" | "orphanRemoval";

export type ContainerPermissions = {
  terminal: boolean;
  fileWrites: boolean;
  orphanRemoval: boolean;
};

const COLUMN = {
  terminal: "allowTerminal",
  fileWrites: "allowFileWrites",
  orphanRemoval: "allowOrphanRemoval",
} as const;

const MESSAGE: Record<ContainerPermission, string> = {
  terminal: "The terminal is turned off for this server. Turn it on in Account, under Container permissions.",
  fileWrites: "Changing files is turned off for this server. Turn it on in Account, under Container permissions.",
  orphanRemoval: "Removing leftovers is turned off for this server. Turn it on in Account, under Container permissions.",
};

export function permissionsOf(row: {
  allowTerminal: boolean;
  allowFileWrites: boolean;
  allowOrphanRemoval: boolean;
}): ContainerPermissions {
  return {
    terminal: row.allowTerminal,
    fileWrites: row.allowFileWrites,
    orphanRemoval: row.allowOrphanRemoval,
  };
}

/** Read one server's permissions, only for its owner. Unknown or foreign servers are 404. */
export async function getPermissions(userId: string, serverId: string): Promise<ContainerPermissions> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.servers)
    .where(and(eq(schema.servers.id, serverId), eq(schema.servers.userId, userId)))
    .get();
  if (!row) throw notFound("Server not found");
  return permissionsOf(row);
}

/** Throw 403 when the owner has switched this feature off. Call before any SSH work. */
export function assertAllowed(perms: ContainerPermissions, feature: ContainerPermission): void {
  if (!perms[feature]) throw new HttpError(403, MESSAGE[feature], "disabled");
}

/** Change one or more switches. Only the owner can, and each change is audited by name only. */
export async function setPermissions(
  userId: string,
  serverId: string,
  patch: Partial<ContainerPermissions>
): Promise<ContainerPermissions> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.servers)
    .where(and(eq(schema.servers.id, serverId), eq(schema.servers.userId, userId)))
    .get();
  if (!row) throw notFound("Server not found");

  const values: Partial<Record<(typeof COLUMN)[ContainerPermission], boolean>> = {};
  for (const key of Object.keys(COLUMN) as ContainerPermission[]) {
    if (typeof patch[key] === "boolean") values[COLUMN[key]] = patch[key];
  }
  if (Object.keys(values).length > 0) {
    await db.update(schema.servers).set(values).where(eq(schema.servers.id, row.id));
    await audit(userId, "container.permissions", row.id, {
      changed: Object.keys(values).map((c) => c.replace(/^allow/, "")).join(", "),
    });
  }
  return getPermissions(userId, serverId);
}
