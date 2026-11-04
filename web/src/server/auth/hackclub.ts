import { createHash, randomBytes } from "node:crypto";
import { config } from "@/server/config";

const BASE = "https://auth.hackclub.com";

/**
 * Hack Club Auth is an OAuth2 / OpenID Connect provider. Community apps may
 * request openid, profile, email, slack_id and verification_status only.
 * We ask for the minimum needed to identify someone: openid and profile.
 * The email scope is added so a person can be recognised across accounts.
 */
export const SCOPES = ["openid", "profile", "email"] as const;

export type HackClubProfile = {
  /** Stable public id (`sub`). */
  id: string;
  name: string;
  email: string | null;
  slackId: string | null;
};

type FetchLike = typeof fetch;

export function redirectUri() {
  return `${config().APP_URL.replace(/\/$/, "")}/api/auth/callback`;
}

export type AuthRequest = {
  url: string;
  state: string;
  /** Keep in a short-lived httpOnly cookie until the callback. */
  codeVerifier: string;
};

/** Build the authorize URL, with state and PKCE (ignored if unsupported). */
export function createAuthRequest(): AuthRequest {
  const c = config();
  if (!c.HACKCLUB_CLIENT_ID) {
    throw new Error("HACKCLUB_CLIENT_ID is not set");
  }
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const url = new URL(`${BASE}/oauth/authorize`);
  url.searchParams.set("client_id", c.HACKCLUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, codeVerifier };
}

/** Exchange the code for an access token, then read the profile. */
export async function completeLogin(
  code: string,
  codeVerifier: string,
  fetchImpl: FetchLike = fetch
): Promise<HackClubProfile> {
  const c = config();
  if (!c.HACKCLUB_CLIENT_ID || !c.HACKCLUB_CLIENT_SECRET) {
    throw new Error("Hack Club Auth is not configured");
  }

  const tokenRes = await fetchImpl(`${BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.HACKCLUB_CLIENT_ID,
      client_secret: c.HACKCLUB_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      code,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Hack Club Auth rejected the login (token ${tokenRes.status})`);
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("Hack Club Auth returned no access token");
  }

  const infoRes = await fetchImpl(`${BASE}/oauth/userinfo`, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/json",
    },
  });
  if (!infoRes.ok) {
    throw new Error(`Could not read the Hack Club profile (userinfo ${infoRes.status})`);
  }
  return parseProfile(await infoRes.json());
}

export function parseProfile(raw: unknown): HackClubProfile {
  const o = (raw ?? {}) as Record<string, unknown>;
  const sub = typeof o.sub === "string" ? o.sub : typeof o.id === "string" ? o.id : null;
  if (!sub) throw new Error("Hack Club profile has no id");

  const given = typeof o.given_name === "string" ? o.given_name : "";
  const family = typeof o.family_name === "string" ? o.family_name : "";
  const name =
    (typeof o.name === "string" && o.name.trim()) ||
    [given, family].filter(Boolean).join(" ").trim() ||
    (typeof o.nickname === "string" && o.nickname) ||
    "Hack Clubber";

  return {
    id: sub,
    name,
    email: typeof o.email === "string" ? o.email : null,
    slackId: typeof o.slack_id === "string" ? o.slack_id : null,
  };
}
