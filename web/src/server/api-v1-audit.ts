import { and, eq, gt, max } from "drizzle-orm";
import type { Principal } from "@/server/api-tokens";
import { getDb, schema } from "@/server/db";

/**
 * Record which access token made a change.
 *
 * The services (create project, set an env var, add a domain, ...) already
 * write their own audit entry, with the names the Activity page knows how to
 * show. Writing a second entry would show every API change twice. So this runs
 * the service, then adds `via: "api"` and the token's id to the entry that
 * service just wrote for this user and action. If the service threw, nothing
 * is tagged. A secret is never put in the entry: the token id is not the secret.
 *
 * A change made in a browser by the same person at the very same moment, with
 * the same action name, could be tagged by mistake. That mislabels who did it;
 * it cannot hide a change.
 */
export async function tagAudit<T>(
  p: Principal,
  action: string,
  fn: () => Promise<T>,
  extra: Record<string, string | number | boolean> = {}
): Promise<T> {
  const db = await getDb();
  const before = await db
    .select({ id: max(schema.auditLog.id) })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, p.userId))
    .get();
  const floor = before?.id ?? 0;

  const result = await fn();

  try {
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.userId, p.userId), eq(schema.auditLog.action, action), gt(schema.auditLog.id, floor)));
    for (const row of rows) {
      let meta: Record<string, unknown> = {};
      try {
        const parsed: unknown = row.meta ? JSON.parse(row.meta) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
      } catch {
        meta = {};
      }
      await db
        .update(schema.auditLog)
        .set({ meta: JSON.stringify({ ...meta, ...extra, via: "api", token: p.tokenId }) })
        .where(eq(schema.auditLog.id, row.id));
    }
  } catch (err) {
    // Like audit() itself, this must never undo a change that already happened.
    console.warn("audit tag failed", err instanceof Error ? err.message : err);
  }
  return result;
}
