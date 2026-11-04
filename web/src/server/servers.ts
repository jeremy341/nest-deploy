import { and, eq } from "drizzle-orm";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { newId, open, seal } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { NestSession, SshError } from "@/server/ssh/connection";
import { generateServerKey } from "@/server/ssh/keys";
import {
  probeIssues,
  probeSession,
  type NestProbe,
  type ProbeIssue,
} from "@/server/ssh/probe";

export type ServerRow = typeof schema.servers.$inferSelect;

export const MAX_SERVERS_PER_USER = 5;

const NEST_USERNAME = /^[a-z0-9][a-z0-9._-]{0,31}$/i;

export function validateNestUsername(value: string): string {
  const v = value.trim();
  if (!NEST_USERNAME.test(v)) {
    throw new HttpError(
      400,
      "That does not look like a Nest username. Use the name you log in with, for example sam-r.",
      "validation"
    );
  }
  return v;
}

/** Public view of a server: never includes key material beyond the public key. */
export function publicServer(row: ServerRow) {
  return {
    id: row.id,
    nestUsername: row.nestUsername,
    host: row.host,
    publicKey: row.publicKey,
    keyFingerprint: row.keyFingerprint,
    hostKeyFingerprint: row.hostKeyFingerprint,
    status: row.status,
    lastError: row.lastError,
    probe: row.probe ? (JSON.parse(row.probe) as NestProbe) : null,
    issues: row.probe ? probeIssues(JSON.parse(row.probe) as NestProbe) : [],
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listServers(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.userId, userId))
    .orderBy(schema.servers.createdAt);
}

/** Load a server only if it belongs to the user. */
export async function getServerForUser(userId: string, serverId: string) {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.servers)
    .where(and(eq(schema.servers.id, serverId), eq(schema.servers.userId, userId)))
    .get();
  if (!row) throw notFound("Server not found");
  return row;
}

export async function createServer(
  userId: string,
  nestUsername: string,
  /** Tests point this at a mock SSH server. The API never passes it. */
  target?: { host: string; port: number }
) {
  const username = validateNestUsername(nestUsername);
  const db = await getDb();

  const mine = await listServers(userId);
  if (mine.length >= MAX_SERVERS_PER_USER) {
    throw new HttpError(
      400,
      `You can connect up to ${MAX_SERVERS_PER_USER} servers.`,
      "limit"
    );
  }
  if (mine.some((s) => s.nestUsername.toLowerCase() === username.toLowerCase())) {
    throw new HttpError(409, `${username} is already connected.`, "conflict");
  }

  const id = newId();
  const key = generateServerKey(`nest-deploy:${username}`);
  const c = config();
  await db.insert(schema.servers).values({
    id,
    userId,
    nestUsername: username,
    host: target?.host ?? c.NEST_HOST,
    port: target?.port ?? c.NEST_PORT,
    publicKey: key.publicKey,
    privateKeyEnc: seal(key.privateKey, `server:${id}`),
    keyFingerprint: key.fingerprint,
    status: "pending",
    createdAt: new Date(),
  });
  return getServerForUser(userId, id);
}

/** Replace the key. The old one stops working once removed in the dashboard. */
export async function rotateServerKey(userId: string, serverId: string) {
  const server = await getServerForUser(userId, serverId);
  const key = generateServerKey(`nest-deploy:${server.nestUsername}`);
  const db = await getDb();
  await db
    .update(schema.servers)
    .set({
      publicKey: key.publicKey,
      privateKeyEnc: seal(key.privateKey, `server:${server.id}`),
      keyFingerprint: key.fingerprint,
      status: "pending",
      lastError: null,
      probe: null,
    })
    .where(eq(schema.servers.id, server.id));
  await audit(userId, "server.rotate_key", null, { server: server.nestUsername });
  return getServerForUser(userId, serverId);
}

export async function deleteServer(userId: string, serverId: string) {
  const server = await getServerForUser(userId, serverId);
  const db = await getDb();
  await db.delete(schema.servers).where(eq(schema.servers.id, server.id));
}

/** Open an SSH session using the stored key and pinned host key. */
export async function connectToServer(server: ServerRow): Promise<NestSession> {
  const privateKey = open(server.privateKeyEnc, `server:${server.id}`);
  return NestSession.connect({
    host: server.host,
    port: server.port,
    username: server.nestUsername,
    privateKey,
    pinnedHostKey: server.hostKeyFingerprint,
  });
}

/** Run `fn` with a session and always close it. */
export async function withServerSession<T>(
  server: ServerRow,
  fn: (session: NestSession) => Promise<T>
): Promise<T> {
  const session = await connectToServer(server);
  try {
    return await fn(session);
  } finally {
    session.close();
  }
}

export type TestResult =
  | { ok: true; probe: NestProbe; issues: ProbeIssue[] }
  | { ok: false; error: string; kind: SshError["kind"] | "unknown" };

/**
 * Connect, pin the host key on first use, probe the container and save the
 * outcome. Never throws for connection problems; they are returned.
 */
export async function testServer(userId: string, serverId: string): Promise<TestResult> {
  const server = await getServerForUser(userId, serverId);
  const db = await getDb();

  try {
    const session = await connectToServer(server);
    try {
      const probe = await probeSession(session);
      const issues = probeIssues(probe);
      await db
        .update(schema.servers)
        .set({
          status: "connected",
          lastError: null,
          probe: JSON.stringify(probe),
          lastCheckedAt: new Date(),
          hostKeyFingerprint: server.hostKeyFingerprint ?? session.hostKeyFingerprint,
        })
        .where(eq(schema.servers.id, server.id));
      return { ok: true, probe, issues };
    } finally {
      session.close();
    }
  } catch (err) {
    const error = err instanceof SshError ? err : null;
    const message = error?.message ?? "Could not connect to Nest.";
    await db
      .update(schema.servers)
      .set({ status: "error", lastError: message, lastCheckedAt: new Date() })
      .where(eq(schema.servers.id, server.id));
    return { ok: false, error: message, kind: error?.kind ?? "unknown" };
  }
}
