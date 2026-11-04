import { createPrivateKey, createHmac, randomBytes } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { config } from "@/server/config";
import { safeEqual } from "@/server/crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

const API = "https://api.github.com";

type FetchLike = typeof fetch;

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GithubError";
  }
}

function headers(token: string, extra: Record<string, string> = {}) {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "nest-deploy",
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

/** A short-lived JWT that identifies the App itself (RS256, 9 minutes). */
export async function appJwt(now = Math.floor(Date.now() / 1000)): Promise<string> {
  const c = config();
  if (!c.GITHUB_APP_ID || !c.GITHUB_APP_PRIVATE_KEY) {
    throw new GithubError("The GitHub App is not configured.");
  }
  // GitHub issues PKCS#1 keys; jose wants PKCS#8.
  const pkcs8 = createPrivateKey(c.GITHUB_APP_PRIVATE_KEY).export({
    type: "pkcs8",
    format: "pem",
  }) as string;
  const key = await importPKCS8(pkcs8, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(c.GITHUB_APP_ID)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 9 * 60)
    .sign(key);
}

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

/** An installation access token, cached until a minute before it expires. */
export async function installationToken(
  installationId: number,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const hit = tokenCache.get(installationId);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.token;

  const res = await fetchImpl(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: headers(await appJwt()),
  });
  if (!res.ok) {
    throw new GithubError(
      res.status === 404
        ? "The GitHub App is no longer installed on that account."
        : `GitHub refused to issue an access token (${res.status}).`,
      res.status
    );
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  tokenCache.set(installationId, {
    token: body.token,
    expiresAt: new Date(body.expires_at).getTime(),
  });
  return body.token;
}

export type RepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  cloneUrl: string;
};

export async function listInstallationRepos(
  installationId: number,
  fetchImpl: FetchLike = fetch
): Promise<RepoSummary[]> {
  const token = await installationToken(installationId, fetchImpl);
  const out: RepoSummary[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetchImpl(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: headers(token),
    });
    if (!res.ok) throw new GithubError(`Could not list repositories (${res.status}).`, res.status);
    const body = (await res.json()) as {
      repositories: {
        id: number;
        full_name: string;
        private: boolean;
        default_branch: string;
        pushed_at: string | null;
        clone_url: string;
      }[];
    };
    for (const r of body.repositories) {
      out.push({
        id: r.id,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
        cloneUrl: r.clone_url,
      });
    }
    if (body.repositories.length < 100) break;
  }
  return out.sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
}

// ------------------------------------------------------------ user linking

export function githubAuthorizeUrl(): { url: string; state: string } {
  const c = config();
  if (!c.GITHUB_APP_CLIENT_ID) throw new GithubError("The GitHub App is not configured.");
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", c.GITHUB_APP_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${c.APP_URL.replace(/\/$/, "")}/api/github/callback`);
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

/**
 * Exchange the OAuth code for a user token, then list the installations that
 * user can access. The user token is used once and never stored.
 */
export async function installationsForCode(
  code: string,
  fetchImpl: FetchLike = fetch
): Promise<{ id: number; login: string; type: string }[]> {
  const c = config();
  if (!c.GITHUB_APP_CLIENT_ID || !c.GITHUB_APP_CLIENT_SECRET) {
    throw new GithubError("The GitHub App is not configured.");
  }
  const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "nest-deploy" },
    body: JSON.stringify({
      client_id: c.GITHUB_APP_CLIENT_ID,
      client_secret: c.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: `${c.APP_URL.replace(/\/$/, "")}/api/github/callback`,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !token.access_token) {
    throw new GithubError(`GitHub did not accept the authorization (${token.error ?? tokenRes.status}).`);
  }
  const res = await fetchImpl(`${API}/user/installations?per_page=100`, {
    headers: headers(token.access_token),
  });
  if (!res.ok) throw new GithubError(`Could not read your installations (${res.status}).`, res.status);
  const body = (await res.json()) as {
    installations: { id: number; account: { login: string; type: string } | null; app_id: number }[];
  };
  const appId = Number(c.GITHUB_APP_ID);
  return body.installations
    .filter((i) => !appId || i.app_id === appId)
    .map((i) => ({ id: i.id, login: i.account?.login ?? "unknown", type: i.account?.type ?? "User" }));
}

export async function saveInstallations(
  userId: string,
  installs: { id: number; login: string; type: string }[]
) {
  const db = await getDb();
  for (const i of installs) {
    const existing = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.id, i.id))
      .get();
    if (existing && existing.userId !== userId) {
      // An installation belongs to one Nest Deploy user: the first to link it.
      continue;
    }
    if (existing) {
      await db
        .update(schema.githubInstallations)
        .set({ accountLogin: i.login, accountType: i.type })
        .where(eq(schema.githubInstallations.id, i.id));
    } else {
      await db.insert(schema.githubInstallations).values({
        id: i.id,
        userId,
        accountLogin: i.login,
        accountType: i.type,
        createdAt: new Date(),
      });
    }
  }
}

export async function userInstallations(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.userId, userId));
}

/** Confirm a user owns an installation before letting them use it. */
export async function assertInstallationOwned(userId: string, installationId: number) {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.githubInstallations)
    .where(
      and(
        eq(schema.githubInstallations.id, installationId),
        eq(schema.githubInstallations.userId, userId)
      )
    )
    .get();
  if (!row) throw new GithubError("That GitHub installation is not linked to your account.", 403);
  return row;
}

// ------------------------------------------------------------ webhooks

/** Constant-time check of GitHub's `X-Hub-Signature-256` header. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signatureHeader);
}

export function clearTokenCacheForTests() {
  tokenCache.clear();
}
