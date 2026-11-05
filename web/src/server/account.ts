import { and, desc, eq, ne } from "drizzle-orm";
import { audit } from "@/server/audit";
import { sha256Hex } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { terminals } from "@/server/terminal";

/** Everything the account page shows and changes. */

export type SessionRow = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  current: boolean;
};

export async function listSessions(userId: string, currentToken: string | undefined): Promise<SessionRow[]> {
  const db = await getDb();
  const currentId = currentToken ? sha256Hex(currentToken) : null;
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.createdAt));
  return rows
    .filter((r) => r.expiresAt.getTime() > Date.now())
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      userAgent: r.userAgent,
      current: r.id === currentId,
    }));
}

export async function revokeSession(userId: string, sessionId: string, currentToken: string | undefined) {
  if (currentToken && sha256Hex(currentToken) === sessionId) {
    throw new HttpError(400, "That is the session you are using. Sign out instead.", "validation");
  }
  const db = await getDb();
  const gone = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)))
    .returning({ id: schema.sessions.id });
  if (gone.length === 0) throw notFound("Session not found");
  // A terminal belongs to the account, not to one browser: revoking a session closes them all.
  await terminals().closeAllForUser(userId, "signed-out");
  await audit(userId, "account.session_revoke");
}

/** Sign out everywhere except this browser. */
export async function revokeOtherSessions(userId: string, currentToken: string | undefined) {
  const db = await getDb();
  const keep = currentToken ? sha256Hex(currentToken) : "";
  const gone = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keep)))
    .returning({ id: schema.sessions.id });
  if (gone.length > 0) await terminals().closeAllForUser(userId, "signed-out");
  await audit(userId, "account.sessions_revoke_all", null, { count: gone.length });
  return gone.length;
}

export async function listInstallations(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.userId, userId));
}

/** A short, readable name for a browser, from its user agent. */
export function browserLabel(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Delete the account and everything under it. Apps already running on a Nest
 * container are left alone: we stop managing them, we do not remove them.
 */
export async function deleteAccount(userId: string, userName: string, typedName: unknown) {
  if (typeof typedName !== "string" || typedName.trim() !== userName) {
    throw new HttpError(400, "Type your name exactly to confirm.", "validation");
  }
  // Close first (and wait for its audit entry) so nothing is written after the account is gone.
  await terminals().closeAllForUser(userId, "signed-out");
  const db = await getDb();
  await db.delete(schema.auditLog).where(eq(schema.auditLog.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
}
