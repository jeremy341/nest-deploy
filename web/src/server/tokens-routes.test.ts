import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { SCOPES, principalFor, requireScope } from "@/server/api-tokens";
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
import { DELETE as revokeRoute, PATCH as editRoute } from "@/app/api/tokens/[id]/route";

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

  it("defaults to 90 days, or to 7 when a container permission is picked, and accepts every permission", async () => {
    const plain = await createAs(sam, { name: "Reads", scopes: ["projects:read", "env:write"] });
    expect(plain.res.status).toBe(201);
    const plainDays = ((await expiresOf(plain.body.token?.id as string)) - Date.now()) / 86_400_000;
    expect(Math.round(plainDays)).toBe(90);

    const { res, body } = await createAs(sam, { name: "All", scopes: [...SCOPES] });
    expect(res.status).toBe(201);
    const days = ((await expiresOf(body.token?.id as string)) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    expect(body.token?.scopes).toEqual([...SCOPES]);
  });

  describe("the 7 day cap for the terminal and file changes", () => {
    const SHORT = ["terminal:use", "files:write"] as const;
    const patch = (id: string, body: unknown) => editRoute(json(`/api/tokens/${id}`, "PATCH", body), idCtx(id));

    it("refuses a longer expiry when the token is created, and says why", async () => {
      for (const scope of SHORT) {
        for (const expiresInDays of [30, 90, 365]) {
          const { res, body } = await createAs(sam, { name: "Shell", scopes: ["projects:read", scope], expiresInDays });
          expect(res.status, `${scope} ${expiresInDays}`).toBe(400);
          expect(body.error?.code).toBe("short_lived");
          expect(body.error?.message).toMatch(/7 days/);
        }
        const ok = await createAs(sam, { name: "Shell", scopes: [scope], expiresInDays: 7 });
        expect(ok.res.status).toBe(201);
        const days = ((await expiresOf(ok.body.token?.id as string)) - Date.now()) / 86_400_000;
        expect(Math.round(days)).toBe(7);
      }
    });

    it("does not cap a token with only the other permissions, including files:read", async () => {
      const { res } = await createAs(sam, { name: "Read", scopes: ["files:read", "env:write", "projects:write"], expiresInDays: 365 });
      expect(res.status).toBe(201);
    });

    it("refuses an edit that adds a container permission to a longer-lived token", async () => {
      const { body: made } = await createAs(sam, { ...valid, expiresInDays: 90 });
      const id = made.token?.id as string;
      const before = await expiresOf(id);
      for (const scope of SHORT) {
        const res = await patch(id, { scopes: ["projects:read", scope] });
        expect(res.status, scope).toBe(400);
        expect((await bodyOf(res)).error?.code).toBe("short_lived");
      }
      // Adding the permission is allowed together with a 7 day expiry.
      const both = await patch(id, { scopes: ["projects:read", "terminal:use"], expiresInDays: 7 });
      expect(both.status).toBe(200);
      expect((await expiresOf(id)) - Date.now()).toBeLessThanOrEqual(7 * 86_400_000);
      expect(await expiresOf(id)).toBeLessThan(before);
    });

    it("refuses a longer expiry on a token that holds one, but allows renaming and 7 days", async () => {
      const { body: made } = await createAs(sam, { name: "Shell", scopes: ["terminal:use"], expiresInDays: 7 });
      const id = made.token?.id as string;
      for (const expiresInDays of [30, 90, 365]) {
        const res = await patch(id, { expiresInDays });
        expect(res.status, String(expiresInDays)).toBe(400);
        expect((await bodyOf(res)).error?.message).toMatch(/7 days/);
      }
      expect((await patch(id, { name: "Renamed" })).status).toBe(200);
      expect((await patch(id, { expiresInDays: 7 })).status).toBe(200);
      // Taking the permission away lifts the cap again.
      expect((await patch(id, { scopes: ["projects:read"], expiresInDays: 365 })).status).toBe(200);
    });

    it("leaves tokens that never held a container permission alone", async () => {
      const { body: made } = await createAs(sam, { ...valid, expiresInDays: 90 });
      const id = made.token?.id as string;
      expect((await patch(id, { expiresInDays: 365 })).status).toBe(200);
      expect((await patch(id, { scopes: ["files:read", "env:read"] })).status).toBe(200);
    });
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

  describe("PATCH /api/tokens/[id]", () => {
    const patch = (id: string, body: unknown) => editRoute(json(`/api/tokens/${id}`, "PATCH", body), idCtx(id));
    const rowOf = (id: string) => ctx.db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).get();

    it("answers 401 when signed out", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      expect((await patch("x", { name: "New" })).status).toBe(401);
    });

    it("blocks a cross-origin edit", async () => {
      const { body: made } = await createAs(sam);
      const id = made.token?.id as string;
      const res = await editRoute(json(`/api/tokens/${id}`, "PATCH", { name: "Hacked" }, { origin: "https://evil.example" }), idCtx(id));
      expect(res.status).toBe(403);
      expect((await rowOf(id))?.name).toBe("CI bot");
    });

    it("answers 404 for another user's token and an unknown id, and changes nothing", async () => {
      const { body: kims } = await createAs(kim, { ...valid, name: "Kim token" });
      const kimId = kims.token?.id as string;
      vi.mocked(getCurrentUser).mockResolvedValue(sam as never);
      expect((await patch(kimId, { name: "Mine now" })).status).toBe(404);
      expect((await patch("no-such-token", { name: "x" })).status).toBe(404);
      expect((await rowOf(kimId))?.name).toBe("Kim token");
    });

    it("answers 409 for a revoked token and leaves it as it was", async () => {
      const { body: made } = await createAs(sam);
      const id = made.token?.id as string;
      await revokeRoute(json(`/api/tokens/${id}`, "DELETE"), idCtx(id));
      const res = await patch(id, { name: "Back from the dead", expiresInDays: 365 });
      expect(res.status).toBe(409);
      expect((await bodyOf(res)).error?.code).toBe("revoked");
      expect((await rowOf(id))?.name).toBe("CI bot");
      expect(await principalFor(made.secret ?? null)).toBeNull();
    });

    it("rejects bad bodies with 400 and changes nothing", async () => {
      const { body: made } = await createAs(sam);
      const id = made.token?.id as string;
      const bad: unknown[] = [
        {},
        { name: "" },
        { name: "   " },
        { name: "x".repeat(61) },
        { scopes: [] },
        { scopes: ["terminal:write"] },
        { scopes: "projects:read" },
        { expiresInDays: 45 },
        { expiresInDays: "30" },
        { name: "Ok", prefix: "ndp_evil" },
        { name: "Ok", hash: "abc" },
        { name: "Ok", revokedAt: null },
        { name: "Ok", userId: kim.id },
        "not json",
        [{ name: "x" }],
      ];
      for (const body of bad) {
        expect((await patch(id, body)).status, JSON.stringify(body)).toBe(400);
      }
      const empty = new NextRequest(`${ORIGIN}/api/tokens/${id}`, { method: "PATCH", headers: { origin: ORIGIN } });
      expect((await editRoute(empty, idCtx(id))).status).toBe(400);
      const row = await rowOf(id);
      expect(row?.name).toBe("CI bot");
      expect(JSON.parse(row?.scopes ?? "[]")).toEqual(valid.scopes);
    });

    it("renames a token without touching its scopes, expiry or secret", async () => {
      const { body: made } = await createAs(sam);
      const id = made.token?.id as string;
      const before = await rowOf(id);
      const res = await patch(id, { name: "  Renamed bot  " });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expect(text).not.toContain(made.secret as string);
      expect(text).not.toMatch(/"(secret|hash)"/);
      const body = JSON.parse(text) as Body;
      expect(body.token).toMatchObject({ id, name: "Renamed bot", scopes: valid.scopes, active: true, prefix: made.token?.prefix });
      const after = await rowOf(id);
      expect(after?.hash).toBe(before?.hash);
      expect(after?.expiresAt.getTime()).toBe(before?.expiresAt.getTime());
      // It still works with the same secret, and the list shows the new name.
      expect(await principalFor(made.secret ?? null)).toMatchObject({ tokenId: id });
      const list = (await bodyOf(await listRoute(json("/api/tokens", "GET"), undefined))).tokens ?? [];
      expect(list.map((t) => t.name)).toEqual(["Renamed bot"]);
    });

    it("narrowing the scopes takes effect on the very next request", async () => {
      const { body: made } = await createAs(sam, { name: "Deployer", scopes: ["projects:read", "deployments:write"] });
      const id = made.token?.id as string;
      const secret = made.secret ?? null;
      const before = await principalFor(secret);
      expect(before?.scopes).toContain("deployments:write");
      expect(() => requireScope(before as NonNullable<typeof before>, "deployments:write")).not.toThrow();

      const res = await patch(id, { scopes: ["projects:read"] });
      expect(res.status).toBe(200);
      expect((await bodyOf(res)).token?.scopes).toEqual(["projects:read"]);

      const after = await principalFor(secret);
      expect(after?.scopes).toEqual(["projects:read"]);
      expect(() => requireScope(after as NonNullable<typeof after>, "deployments:write")).toThrowError(/deployments:write/);
    });

    it("changes the expiry from now, so it can extend or shorten", async () => {
      const { body: made } = await createAs(sam, { ...valid, expiresInDays: 30 });
      const id = made.token?.id as string;
      const daysLeft = async () => Math.round(((await expiresOf(id)) - Date.now()) / 86_400_000);
      expect(await daysLeft()).toBe(30);

      expect((await patch(id, { expiresInDays: 365 })).status).toBe(200);
      expect(await daysLeft()).toBe(365);

      const res = await patch(id, { expiresInDays: 7 });
      expect(res.status).toBe(200);
      expect(await daysLeft()).toBe(7);
      const token = (await bodyOf(res)).token;
      expect(token).toMatchObject({ active: true, name: "CI bot" });
      expect(await principalFor(made.secret ?? null)).toMatchObject({ tokenId: id });
    });

    it("changes several fields at once and writes one audit entry naming only the fields", async () => {
      const { body: made } = await createAs(sam);
      const id = made.token?.id as string;
      const res = await patch(id, { name: "Both", scopes: ["logs:read", "projects:read"], expiresInDays: 90 });
      expect(res.status).toBe(200);
      const rows = (await ctx.db.select().from(schema.auditLog)).filter((r) => r.action === "token.update" && r.target === id);
      expect(rows).toHaveLength(1);
      const meta = JSON.parse(rows[0].meta ?? "{}") as Record<string, string>;
      expect(meta.fields).toBe("name, scopes, expiry");
      expect(rows[0].meta).not.toContain(made.secret as string);
      expect(rows[0].userId).toBe(sam.id);
    });
  });

  it("stops at 25 active tokens with a 400 that says why", async () => {
    for (let i = 0; i < 25; i++) expect((await createAs(sam, { ...valid, name: `t${i}` })).res.status).toBe(201);
    const { res, body } = await createAs(sam, { ...valid, name: "one more" });
    expect(res.status).toBe(400);
    expect(body.error?.message).toMatch(/25 active tokens/);
  });
});
