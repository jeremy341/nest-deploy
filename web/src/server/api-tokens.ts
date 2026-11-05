import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/audit";
import { newId, randomToken, sha256Hex } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";

/**
 * Personal access tokens for the public API and AI agents.
 *
 * A token is a bearer secret shown once. Only its SHA-256 is stored. Each token
 * has a short list of scopes and an expiry. Tokens can NOT create other tokens,
 * and they can never reach leftover removal, the permission switches, or account,
 * session and token management: those stay with a signed-in browser on purpose.
 * The terminal and file scopes exist but are tight: they last 7 days at most
 * (see `SHORT_LIVED_SCOPES`) and only work while the owner has the matching
 * per-server switch on.
 */

export const SCOPES = [
  "projects:read",
  "projects:write",
  "deployments:read",
  "deployments:write",
  "logs:read",
  "env:read",
  "env:write",
  "domains:read",
  "domains:write",
  "notifications:read",
  "alerts:read",
  "analytics:read",
  "activity:read",
  "resources:read",
  "container:read",
  "files:read",
  "files:write",
  "terminal:use",
] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  "projects:read": "Read projects, their settings and status page",
  "projects:write": "Create, change and delete projects, including build and start commands",
  "deployments:read": "Read deployments and build output",
  "deployments:write": "Deploy, redeploy, cancel and roll back, and replace or revoke the deploy hook",
  "logs:read": "Read runtime logs",
  "env:read": "List environment variable names (never their values)",
  "env:write": "Set and remove environment variables",
  "domains:read": "Read domains",
  "domains:write": "Add, check and remove domains",
  "notifications:read": "Read notification settings and send a test message",
  "alerts:read": "Read alert settings and history",
  "analytics:read": "Read visitor analytics",
  "activity:read": "Read your activity log",
  "resources:read": "Read CPU, memory and disk, now and over time",
  "container:read": "List servers and see what is on the container (read only)",
  "files:read": "List and read files in a project's folder on the container",
  "files:write": "Create, change, rename and delete files in a project's shared/ folder (never the live release)",
  "terminal:use": "Open and use a shell on the container. Commands run for real",
};

/**
 * Scopes that act on the container itself. A token holding one lives at most
 * `SHORT_LIVED_MAX_DAYS` days, enforced when it is created and when it is edited.
 * The owner's per-server switch (terminal, file changes) must also be on.
 */
export const SHORT_LIVED_SCOPES: readonly Scope[] = ["terminal:use", "files:write"];
export const SHORT_LIVED_MAX_DAYS = 7;

export const SHORT_LIVED_NOTE = `A token with the terminal or file change permission expires in ${SHORT_LIVED_MAX_DAYS} days at most.`;

export const holdsShortLivedScope = (scopes: readonly string[]) =>
  scopes.some((s) => (SHORT_LIVED_SCOPES as readonly string[]).includes(s));

export const TOKEN_PREFIX = "ndp_";
const MAX_TOKENS_PER_USER = 25;
const DAY = 86_400_000;

export const createTokenInput = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(60),
  scopes: z.array(z.enum(SCOPES)).min(1, "Pick at least one permission.").max(SCOPES.length),
  /** Days until it expires. Left out, it is 90 days, or 7 for a token that holds a container scope. */
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).optional(),
});

/**
 * Edit a token. Every field is optional but at least one must be sent, and
 * unknown keys are refused so a typo cannot silently do nothing. The secret,
 * its hash and the prefix can never be edited.
 */
export const updateTokenInput = z
  .object({
    name: createTokenInput.shape.name,
    scopes: createTokenInput.shape.scopes,
    /** Days from now, not from creation, so it can extend or shorten the life. */
    expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  })
  .partial()
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Send at least one field to change." });

export type TokenRow = typeof schema.apiTokens.$inferSelect;

export type TokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
};

export function summarize(row: TokenRow, now = Date.now()): TokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopes(row.scopes),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    active: !row.revokedAt && row.expiresAt.getTime() > now,
  };
}

function parseScopes(raw: string): Scope[] {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s as string)) : [];
  } catch {
    return [];
  }
}

/** Create a token. Returns the raw secret once; it cannot be shown again. */
export async function createApiToken(userId: string, raw: unknown, now = new Date()) {
  const input = createTokenInput.parse(raw);
  const db = await getDb();

  const existing = await db
    .select({ id: schema.apiTokens.id, revokedAt: schema.apiTokens.revokedAt })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId));
  if (existing.filter((t) => !t.revokedAt).length >= MAX_TOKENS_PER_USER) {
    throw new HttpError(400, `You can have up to ${MAX_TOKENS_PER_USER} active tokens. Revoke one first.`, "limit");
  }

  const short = holdsShortLivedScope(input.scopes);
  const days = input.expiresInDays ?? (short ? SHORT_LIVED_MAX_DAYS : 90);
  if (short && days > SHORT_LIVED_MAX_DAYS) {
    throw new HttpError(400, `${SHORT_LIVED_NOTE} Pick 7 days, or remove that permission.`, "short_lived");
  }

  const secret = `${TOKEN_PREFIX}${randomToken(32)}`;
  const id = newId();
  const row = {
    id,
    userId,
    name: input.name,
    prefix: secret.slice(0, TOKEN_PREFIX.length + 6),
    hash: sha256Hex(secret),
    scopes: JSON.stringify([...new Set(input.scopes)]),
    createdAt: now,
    lastUsedAt: null,
    expiresAt: new Date(now.getTime() + days * DAY),
    revokedAt: null,
  };
  await db.insert(schema.apiTokens).values(row);
  await audit(userId, "token.create", id, { name: input.name, scopes: input.scopes.join(", ") });
  return { token: summarize(row, now.getTime()), secret };
}

export async function listApiTokens(userId: string): Promise<TokenSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .orderBy(desc(schema.apiTokens.createdAt));
  return rows.map((r) => summarize(r));
}

/** Revoke one of the user's tokens. Revoking is immediate and cannot be undone. */
export async function revokeApiToken(userId: string, tokenId: string, now = new Date()) {
  const db = await getDb();
  const gone = await db
    .update(schema.apiTokens)
    .set({ revokedAt: now })
    .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .returning({ id: schema.apiTokens.id });
  if (gone.length === 0) throw notFound("Token not found");
  await audit(userId, "token.revoke", tokenId);
}

/**
 * Rename a token, change its scopes or move its expiry. A revoked token is
 * final (409); someone else's or an unknown token is a 404. The change is live
 * on the next request, because `principalFor` reads the row every time.
 */
export async function updateApiToken(userId: string, tokenId: string, raw: unknown, now = new Date()) {
  const input = updateTokenInput.parse(raw);
  const db = await getDb();

  const owned = and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId));
  const current = await db.select().from(schema.apiTokens).where(owned).get();
  if (!current) throw notFound("Token not found");
  if (current.revokedAt) throw new HttpError(409, "This token is revoked and cannot be edited.", "revoked");

  const patch: Partial<Pick<TokenRow, "name" | "scopes" | "expiresAt">> = {};
  const meta: Record<string, string> = {};
  const changed: string[] = [];
  if (input.name !== undefined && input.name !== current.name) {
    patch.name = input.name;
    meta.name = input.name;
    changed.push("name");
  }
  if (input.scopes !== undefined) {
    const next = [...new Set(input.scopes)];
    if (JSON.stringify(next) !== JSON.stringify(parseScopes(current.scopes))) {
      patch.scopes = JSON.stringify(next);
      meta.scopes = next.join(", ");
      changed.push("scopes");
    }
  }
  if (input.expiresInDays !== undefined) {
    patch.expiresAt = new Date(now.getTime() + input.expiresInDays * DAY);
    meta.expiresInDays = String(input.expiresInDays);
    changed.push("expiry");
  }
  if (changed.length === 0) return summarize(current, now.getTime());

  // The cap holds for what the token will be, not for what was sent: adding a container
  // scope to a long-lived token, or lengthening a short-lived one, are both refused.
  const nextScopes = patch.scopes !== undefined ? parseScopes(patch.scopes) : parseScopes(current.scopes);
  const nextExpiry = patch.expiresAt ?? current.expiresAt;
  if (holdsShortLivedScope(nextScopes) && nextExpiry.getTime() > now.getTime() + SHORT_LIVED_MAX_DAYS * DAY) {
    throw new HttpError(
      400,
      `${SHORT_LIVED_NOTE} Set the expiry to 7 days in the same change, or remove that permission.`,
      "short_lived"
    );
  }

  // Guard on "not revoked" again so a revoke that lands mid-edit wins.
  const rows = await db
    .update(schema.apiTokens)
    .set(patch)
    .where(and(owned, isNull(schema.apiTokens.revokedAt)))
    .returning();
  if (rows.length === 0) throw new HttpError(409, "This token is revoked and cannot be edited.", "revoked");
  await audit(userId, "token.update", tokenId, { fields: changed.join(", "), ...meta });
  return summarize(rows[0], now.getTime());
}

export type Principal = { userId: string; tokenId: string; scopes: Scope[] };

/** Read the bearer token from a request. Returns null when there is none. */
export function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

/**
 * Who a bearer token belongs to, and what it may do. Expired, revoked and
 * unknown tokens all return null, so callers cannot tell them apart.
 * `lastUsedAt` is updated at most once an hour per token.
 */
export async function principalFor(secret: string | null, now = new Date()): Promise<Principal | null> {
  if (!secret || !secret.startsWith(TOKEN_PREFIX)) return null;
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.hash, sha256Hex(secret)))
    .get();
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 3_600_000) {
    await db.update(schema.apiTokens).set({ lastUsedAt: now }).where(eq(schema.apiTokens.id, row.id));
  }
  return { userId: row.userId, tokenId: row.id, scopes: parseScopes(row.scopes) };
}

/** Throw 403 unless the principal holds the scope. */
export function requireScope(p: Principal, scope: Scope): void {
  if (!p.scopes.includes(scope)) {
    throw new HttpError(403, `This token does not have the ${scope} permission.`, "forbidden");
  }
}
