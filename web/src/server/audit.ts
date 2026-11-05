import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

/**
 * Who did what. Written next to the change itself and never allowed to break
 * it: if the log cannot be written, the action still goes through.
 */
export async function audit(
  userId: string | null,
  action: string,
  target?: string | null,
  meta?: Record<string, string | number | boolean | null>
) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      userId,
      action,
      target: target ?? null,
      meta: meta ? JSON.stringify(meta) : null,
      at: new Date(),
    });
  } catch (err) {
    console.warn("audit write failed", err instanceof Error ? err.message : err);
  }
}

/** Plain-language text for each action. Unknown actions fall back to the raw name. */
export const LABELS: Record<string, string> = {
  "project.create": "Created project",
  "project.update": "Changed settings for",
  "project.delete": "Deleted project",
  "project.restart": "Restarted",
  "env.set": "Saved environment variable on",
  "env.delete": "Removed environment variable from",
  "deploy.redeploy": "Redeployed",
  "deploy.rollback": "Rolled back",
  "deploy.cancel": "Canceled a deployment of",
  "deploy.preview_delete": "Deleted a preview deployment of",
  "hook.trigger": "Deployed through the deploy hook for",
  "hook.create": "Created a deploy hook for",
  "hook.revoke": "Revoked the deploy hook for",
  "domain.add": "Added domain",
  "domain.remove": "Removed domain",
  "server.rotate_key": "Replaced the SSH key for",
  "domain.update": "Changed domain",
  "analytics.enable": "Turned on analytics for",
  "analytics.disable": "Turned off analytics for",
  "status.enable": "Published a status page for",
  "status.disable": "Unpublished the status page for",
  "account.session_revoke": "Signed out another browser",
  "account.sessions_revoke_all": "Signed out all other browsers",
  "monitor.down": "Detected downtime on",
  "monitor.up": "Detected recovery of",
  "container.orphan_remove": "Removed a leftover from the container",
  "terminal.open": "Opened a terminal on",
  "terminal.close": "Closed a terminal on",
  "token.create": "Created an access token",
  "token.revoke": "Revoked an access token",
  "file.write": "Saved a file on",
  "file.mkdir": "Created a folder on",
  "file.rename": "Renamed a file on",
  "file.delete": "Deleted a file on",
  "container.permissions": "Changed container permissions for",
  "terminal.revoked": "Closed a terminal after a sign-out on",
};

export function describeAction(action: string): string {
  return LABELS[action] ?? action;
}

export type ActivityEntry = {
  id: number;
  action: string;
  label: string;
  target: string | null;
  detail: string | null;
  at: string;
};

/** The signed-in user's own recent activity, newest first. */
export async function listActivity(userId: string, limit = 100): Promise<ActivityEntry[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, userId))
    .orderBy(desc(schema.auditLog.at), desc(schema.auditLog.id))
    .limit(Math.min(Math.max(limit, 1), 500));

  // Targets are project ids for most actions; show names instead.
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));
  const names = new Map(projects.map((p) => [p.id, p.name]));

  return rows.map((r) => {
    let detail: string | null = null;
    if (r.meta) {
      try {
        const m = JSON.parse(r.meta) as Record<string, unknown>;
        detail = Object.entries(m)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", ");
      } catch {
        detail = null;
      }
    }
    return {
      id: r.id,
      action: r.action,
      label: describeAction(r.action),
      target: r.target ? (names.get(r.target) ?? r.target) : null,
      detail,
      at: r.at.toISOString(),
    };
  });
}
