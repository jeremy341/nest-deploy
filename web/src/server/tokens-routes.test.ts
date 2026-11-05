import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { SCOPES, principalFor } from "@/server/api-tokens";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { useFreshDb } from "@/server/test/db";

// The route layer, the database and ownership are real. Only sign-in is replaced.
vi.mock("@/server/auth/current", () => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
}));

import { getCurrentUser } from "@/server/auth/current";
import { GET as listRoute, POST as createRoute } from "@/app/api/tokens/route";
import { DELETE as revokeRoute } from "@/app/api/tokens/[id]/route";

type Ctx = Awaited<ReturnType<typeof useFreshDb>>;
let ctx: Ctx;
type Person = { id: string; name: string; email: string | null; hackClubId: string };
let sam: Person;
let kim: Person;

const ORIGIN = "http://localhost:3000";

function json(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

type Summary = { id: string; name: string; prefix: string; scopes: string[]; active: boolean; revokedAt: string | null };
type Body = {
  tokens?: Summary[];
  token?: Summary;
  secret?: string;
  revoked?: boolean;
  error?: { code: string; message: string };
};
const bodyOf = async (res: Response) => (await res.json()) as Body;

const valid = { name: "CI bot", scopes: ["projects:read", "deployments:read"], expiresInDays: 30 };

async function createAs(person: Person, body: unknown = valid) {
  vi.mocked(getCurrentUser).mockResolvedValue(person as never);
  const res = await createRoute(json("/api/tokens", "POST", body), undefined);
  return { res, body: await bodyOf(res) };
}

async function expiresOf(id: string): Promise<number> {
  const row = await ctx.db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).get();
  return row ? row.expiresAt.getTime() : 0;
}

beforeAll(async () => {
  ctx = await useFreshDb();
  sam = await upsertUser({ id: "tk1", name: "Sam", email: null, slackId: null });
  kim = await upsertUser({ id: "tk2", name: "Kim", email: null, slackId: null });
});
afterAll(async () => {
  await ctx.cleanup();
});
beforeEach(async () => {
  await ctx.db.delete(schema.apiTokens);
  vi.mocked(getCurrentUser).mockResolvedValue(sam as never);
});

describe("token routes", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await listRoute(json("/api/tokens", "GET"), undefined)).status).toBe(401);
    expect((await createRoute(json("/api/tokens", "POST", valid), undefined)).status).toBe(401);
    expect((await revokeRoute(json("/api/tokens/x", "DELETE"), idCtx("x"))).status).toBe(401);
    expect(await ctx.db.select().from(schema.apiTokens)).toHaveLength(0);
  });

  it("creates a token with 201 and returns the secret once", async () => {
    const { res, body } = await createAs(sam);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.secret).toMatch(/^ndp_[A-Za-z0-9_-]{20,}$/);
    expect(body.token).toMatchObject({ name: "CI bot", scopes: valid.scopes, active: true, revokedAt: null });
    expect(body.token?.prefix).toBe(body.secret?.slice(0, 10));
    // The secret works as a bearer token straight away.
    expect(await principalFor(body.secret ?? null)).toMatchObject({ userId: sam.id, scopes: valid.scopes });
  });

  it("lists the user's tokens and never includes a secret or a hash", async () => {
    const { body: made } = await createAs(sam);
    const res = await listRoute(json("/api/tokens", "GET"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const list = (JSON.parse(text) as Body).tokens ?? [];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(made.token?.id);
    expect(text).not.toContain(made.secret as string);
    expect(text).not.toMatch(/"(secret|hash)"/);
    expect(Object.keys(list[0]).sort()).toEqual(
      ["active", "createdAt", "expiresAt", "id", "lastUsedAt", "name", "prefix", "revokedAt", "scopes"].sort()
    );
  });

  it("lists only your own tokens", async () => {
    await createAs(sam);
    await createAs(kim, { ...valid, name: "Kim token" });
    vi.mocked(getCurrentUser).mockResolvedValue(kim as never);
    const list = (await bodyOf(await listRoute(json("/api/tokens", "GET"), undefined))).tokens ?? [];
    expect(list.map((t) => t.name)).toEqual(["Kim token"]);
  });

  it("rejects bad bodies with 400 and creates nothing", async () => {
    const bad: unknown[] = [
      {},
      { ...valid, name: "" },
      { ...valid, name: "   " },
      { ...valid, name: "x".repeat(61) },
      { ...valid, scopes: [] },
      { ...valid, scopes: ["terminal:write"] },
      { ...valid, scopes: "projects:read" },
      { ...valid, expiresInDays: 45 },
      { ...valid, expiresInDays: "30" },
      { name: "No scopes" },
      "not json",
      [valid],
    ];
    for (const body of bad) {
      const { res } = await createAs(sam, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const empty = new NextRequest(`${ORIGIN}/api/tokens`, { method: "POST", headers: { origin: ORIGIN } });
    expect((await createRoute(empty, undefined)).status).toBe(400);
    expect(await ctx.db.select().from(schema.apiTokens)).toHaveLength(0);
  });

  it("defaults to 90 days and accepts every permission", async () => {
    const { res, body } = await createAs(sam, { name: "All", scopes: [...SCOPES] });
    expect(res.status).toBe(201);
    const days = ((await expiresOf(body.token?.id as string)) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
    expect(body.token?.scopes).toEqual([...SCOPES]);
  });

  it("blocks a cross-origin create", async () => {
    const res = await createRoute(json("/api/tokens", "POST", valid, { origin: "https://evil.example" }), undefined);
    expect(res.status).toBe(403);
    expect(await ctx.db.select().from(schema.apiTokens)).toHaveLength(0);
  });

  it("revokes your own token, which then stops working and stays listed as revoked", async () => {
    const { body: made } = await createAs(sam);
    const res = await revokeRoute(json(`/api/tokens/${made.token?.id}`, "DELETE"), idCtx(made.token?.id as string));
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ revoked: true });
    expect(await principalFor(made.secret ?? null)).toBeNull();
    const list = (await bodyOf(await listRoute(json("/api/tokens", "GET"), undefined))).tokens ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ active: false });
    expect(list[0].revokedAt).toBeTruthy();
  });

  it("answers 404 for another user's token, an unknown id and a token already revoked", async () => {
    const { body: kims } = await createAs(kim, { ...valid, name: "Kim token" });
    vi.mocked(getCurrentUser).mockResolvedValue(sam as never);
    for (const id of [kims.token?.id as string, "no-such-token"]) {
      expect((await revokeRoute(json(`/api/tokens/${id}`, "DELETE"), idCtx(id))).status).toBe(404);
    }
    // Kim's token is untouched.
    expect(await principalFor(kims.secret ?? null)).toMatchObject({ userId: kim.id });

    const { body: mine } = await createAs(sam);
    const id = mine.token?.id as string;
    expect((await revokeRoute(json(`/api/tokens/${id}`, "DELETE"), idCtx(id))).status).toBe(200);
    expect((await revokeRoute(json(`/api/tokens/${id}`, "DELETE"), idCtx(id))).status).toBe(404);
  });

  it("stops at 25 active tokens with a 400 that says why", async () => {
    for (let i = 0; i < 25; i++) expect((await createAs(sam, { ...valid, name: `t${i}` })).res.status).toBe(201);
    const { res, body } = await createAs(sam, { ...valid, name: "one more" });
    expect(res.status).toBe(400);
    expect(body.error?.message).toMatch(/25 active tokens/);
  });
});
