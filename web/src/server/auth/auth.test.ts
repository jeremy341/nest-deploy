import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetConfigForTests } from "@/server/config";
import {
  completeLogin,
  createAuthRequest,
  parseProfile,
} from "@/server/auth/hackclub";
import {
  createSession,
  deleteSession,
  upsertUser,
  userForSessionToken,
} from "@/server/auth/session";
import { schema } from "@/server/db";
import { sha256Hex } from "@/server/crypto";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;

beforeAll(async () => {
  process.env.HACKCLUB_CLIENT_ID = "client-id";
  process.env.HACKCLUB_CLIENT_SECRET = "client-secret";
  process.env.APP_URL = "https://deploy.example.com";
  resetConfigForTests();
  ctx = await useFreshDb();
});
afterAll(async () => {
  await ctx.cleanup();
  delete process.env.HACKCLUB_CLIENT_ID;
  delete process.env.HACKCLUB_CLIENT_SECRET;
  process.env.APP_URL = "http://localhost:3000";
  resetConfigForTests();
});

describe("Hack Club Auth", () => {
  it("builds an authorize URL with state, PKCE and minimal scopes", () => {
    const req = createAuthRequest();
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe("https://auth.hackclub.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://deploy.example.com/api/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe(req.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(req.codeVerifier);
    expect(req.state.length).toBeGreaterThan(20);
  });

  it("uses a different state every time", () => {
    expect(createAuthRequest().state).not.toBe(createAuthRequest().state);
  });

  it("exchanges the code and reads the profile", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/oauth/token")) {
        return Response.json({ access_token: "tok", token_type: "Bearer" });
      }
      return Response.json({ sub: "ident!abc", name: "Sam R", email: "sam@example.com", slack_id: "U123" });
    }) as unknown as typeof fetch;

    const profile = await completeLogin("the-code", "the-verifier", fake);
    expect(profile).toEqual({ id: "ident!abc", name: "Sam R", email: "sam@example.com", slackId: "U123" });

    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("client_secret")).toBe("client-secret");
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("fails clearly when the token exchange is rejected", async () => {
    const fake = (async () => new Response("no", { status: 400 })) as unknown as typeof fetch;
    await expect(completeLogin("c", "v", fake)).rejects.toThrow(/token 400/);
  });

  it("parses profiles with missing optional fields", () => {
    expect(parseProfile({ sub: "x", given_name: "Ada", family_name: "L" }).name).toBe("Ada L");
    expect(parseProfile({ sub: "x" }).name).toBe("Hack Clubber");
    expect(() => parseProfile({})).toThrow(/no id/);
  });
});

describe("sessions", () => {
  it("creates a user once and reuses it", async () => {
    const a = await upsertUser({ id: "ident!1", name: "Sam", email: null, slackId: null });
    const b = await upsertUser({ id: "ident!1", name: "Sam Renamed", email: "s@x.io", slackId: null });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("Sam Renamed");
  });

  it("stores only a hash of the session token", async () => {
    const user = await upsertUser({ id: "ident!2", name: "Kim", email: null, slackId: null });
    const { token } = await createSession(user.id, "test-agent");
    const rows = await ctx.db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sha256Hex(token));
    expect(rows[0].id).not.toBe(token);
    expect((await userForSessionToken(token))?.id).toBe(user.id);
  });

  it("rejects unknown, expired and deleted sessions", async () => {
    const user = await upsertUser({ id: "ident!3", name: "Lee", email: null, slackId: null });
    expect(await userForSessionToken(undefined)).toBeNull();
    expect(await userForSessionToken("nope")).toBeNull();

    const { token } = await createSession(user.id);
    await ctx.db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, sha256Hex(token)));
    expect(await userForSessionToken(token)).toBeNull();

    const fresh = await createSession(user.id);
    expect(await userForSessionToken(fresh.token)).not.toBeNull();
    await deleteSession(fresh.token);
    expect(await userForSessionToken(fresh.token)).toBeNull();
  });
});
