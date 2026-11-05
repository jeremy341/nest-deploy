import { timeAgo } from "@/lib/status";

/**
 * Pure helpers for the Developer page: expiry wording, the copy-paste
 * snippets and the fixed copy. Nothing here touches the server or the DOM.
 */

const DAY = 86_400_000;

/** How many active tokens one person can hold. Mirrors the limit in server/api-tokens.ts. */
export const ACTIVE_TOKEN_LIMIT = 25;
export const NAME_MAX_LENGTH = 60;

export const EXPIRY_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "365 days" },
] as const;
export const DEFAULT_EXPIRY_DAYS = 90;

/** The permission that can start builds. The form marks it so nobody ticks it by accident. */
export const DEPLOY_SCOPE = "deployments:write";

export type TokenStatus = "active" | "expired" | "revoked";
export const STATUS_LABEL: Record<TokenStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

type Dated = { revokedAt: string | null; expiresAt: string };

/** Revoked wins over expired: a revoked token never comes back. */
export function tokenStatus(t: Dated, now = Date.now()): TokenStatus {
  if (t.revokedAt) return "revoked";
  return new Date(t.expiresAt).getTime() > now ? "active" : "expired";
}

/** Only an active token can be revoked from the list. */
export const canRevoke = (t: Dated, now = Date.now()) => tokenStatus(t, now) === "active";

/** Only an active token can be edited. A revoked one is final; an expired one is left alone. */
export const canEdit = canRevoke;

/** What the editor's expiry select holds: leave it as is, or a number of days from now. */
export type ExpiryChoice = "keep" | (typeof EXPIRY_OPTIONS)[number]["days"];

export type TokenEdit = { name: string; scopes: readonly string[]; expiry: ExpiryChoice };
export type TokenPatch = { name?: string; scopes?: string[]; expiresInDays?: number };

/**
 * Only the fields that differ from the token, so an untouched editor sends
 * nothing and an edit never resets an expiry by accident. Scope order is not a
 * change.
 */
export function buildTokenPatch(token: { name: string; scopes: readonly string[] }, edit: TokenEdit): TokenPatch {
  const patch: TokenPatch = {};
  const name = edit.name.trim();
  if (name !== token.name) patch.name = name;
  const same = edit.scopes.length === token.scopes.length && edit.scopes.every((s) => token.scopes.includes(s));
  if (!same) patch.scopes = [...edit.scopes];
  if (edit.expiry !== "keep") patch.expiresInDays = edit.expiry;
  return patch;
}

/** True when the edit removes the permission that starts builds. */
export function dropsDeployAccess(before: readonly string[], after: readonly string[]): boolean {
  return before.includes(DEPLOY_SCOPE) && !after.includes(DEPLOY_SCOPE);
}

export const DEPLOY_DROP_NOTE =
  "Deploys will stop working for anything that uses this token, including redeploys, cancels and rollbacks.";

const MONTHS =["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Nov 2026", in UTC so the same instant reads the same everywhere. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Never" until the token has been used once. */
export function lastUsedLabel(iso: string | null, now = Date.now()): string {
  return iso ? timeAgo(iso, now) : "Never";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * When a token stops working, in words: "In 12 days", "Tomorrow", "Today",
 * "3 days ago". A revoked token shows the date it was due, since its end was
 * the revoke, not the date.
 */
export function expiryLabel(t: Dated, now = Date.now()): string {
  if (t.revokedAt) return formatDate(t.expiresAt);
  const diff = new Date(t.expiresAt).getTime() - now;
  if (diff > 0) {
    const days = Math.ceil(diff / DAY);
    if (days <= 1) return "Today";
    if (days === 2) return "Tomorrow";
    return `In ${plural(days, "day")}`;
  }
  const ago = Math.floor(-diff / DAY);
  if (ago < 1) return "Today";
  if (ago === 1) return "Yesterday";
  return `${plural(ago, "day")} ago`;
}

/** Tokens that can still be used, for the limit note. */
export function activeCount(tokens: Dated[], now = Date.now()): number {
  return tokens.filter((t) => tokenStatus(t, now) === "active").length;
}

export function limitNote(active: number): string {
  if (active >= ACTIVE_TOKEN_LIMIT) {
    return `You have ${ACTIVE_TOKEN_LIMIT} active tokens, the most allowed. Revoke one to create another.`;
  }
  return `${active} of ${ACTIVE_TOKEN_LIMIT} active tokens used. Revoked and expired tokens do not count.`;
}

// ---- copy -----------------------------------------------------------------

export const SECRET_NOTE = "Copy it now. It will not be shown again.";

/** What a token cannot do. Matches what the API and the agent endpoint refuse. */
export const TOKEN_CANNOT = [
  "Open the terminal.",
  "Change files on your server.",
  "Remove leftovers.",
  "Change container permissions.",
  "Manage your account, your sessions or other tokens.",
] as const;

export const TOKEN_PLACEHOLDER = "ndp_...";

const trimSlash = (origin: string) => origin.replace(/\/+$/, "");

export const apiBase = (origin: string) => `${trimSlash(origin)}/api/v1`;
export const openApiUrl = (origin: string) => `${apiBase(origin)}/openapi.json`;
export const mcpUrl = (origin: string) => `${trimSlash(origin)}/api/mcp`;

/** A one-line request that lists projects. The token is a placeholder, never a real one. */
export function curlExample(origin: string): string {
  return `curl -H "Authorization: Bearer ${TOKEN_PLACEHOLDER}" ${apiBase(origin)}/projects`;
}

/** Config for an MCP client that connects over HTTP and sends the token as a bearer header. */
export function mcpConfigSnippet(origin: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "nest-deploy": {
          type: "http",
          url: mcpUrl(origin),
          headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
        },
      },
    },
    null,
    2
  );
}

/** Pull the first error out of an unknown thrown value, for inline display. */
export function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
