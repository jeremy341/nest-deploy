import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { open } from "@/server/crypto";
import { schema } from "@/server/db";
import {
  createServer,
  deleteServer,
  getServerForUser,
  publicServer,
  rotateServerKey,
  testServer,
  validateNestUsername,
} from "@/server/servers";
import { upsertUser } from "@/server/auth/session";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  otherUserId = (await upsertUser({ id: "u2", name: "Kim", email: null, slackId: null })).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

describe("nest username validation", () => {
  it("accepts normal usernames and rejects shell-ish input", () => {
    expect(validateNestUsername(" sam-r ")).toBe("sam-r");
    for (const bad of ["", "a b", "a;rm", "-lead", "x".repeat(40), "$(id)", "a/b"]) {
      expect(() => validateNestUsername(bad)).toThrow();
    }
  });
});

describe("server lifecycle", () => {
  it("stores the private key sealed and returns only the public half", async () => {
    const row = await createServer(userId, "sam-r");
    expect(row.privateKeyEnc).not.toContain("OPENSSH");
    expect(open(row.privateKeyEnc, `server:${row.id}`)).toContain("BEGIN OPENSSH PRIVATE KEY");

    const view = publicServer(row);
    expect(JSON.stringify(view)).not.toContain("privateKey");
    expect(JSON.stringify(view)).not.toContain("OPENSSH PRIVATE");
    expect(view.publicKey).toMatch(/^ssh-ed25519 /);
    expect(view.status).toBe("pending");
    expect(row.host).toBe("hackclub.app");
  });

  it("will not unseal under another server's id", async () => {
    const row = await getServerForUser(userId, (await createServer(userId, "sam-b")).id);
    expect(() => open(row.privateKeyEnc, "server:other")).toThrow();
  });

  it("rejects duplicates and enforces ownership", async () => {
    await expect(createServer(userId, "SAM-R")).rejects.toMatchObject({ status: 409 });
    const row = (await ctx.db.select().from(schema.servers).where(eq(schema.servers.nestUsername, "sam-r")))[0];
    await expect(getServerForUser(otherUserId, row.id)).rejects.toMatchObject({ status: 404 });
  });

  it("caps servers per user", async () => {
    const limitUser = (await upsertUser({ id: "u3", name: "Max", email: null, slackId: null })).id;
    for (let i = 0; i < 5; i++) await createServer(limitUser, `acct-${i}`);
    await expect(createServer(limitUser, "acct-6")).rejects.toMatchObject({ status: 400 });
  });

  it("rotates the key and resets status", async () => {
    const row = await createServer(otherUserId, "kim-k");
    const rotated = await rotateServerKey(otherUserId, row.id);
    expect(rotated.publicKey).not.toBe(row.publicKey);
    expect(rotated.status).toBe("pending");
  });

  it("deletes a server", async () => {
    const row = await createServer(otherUserId, "kim-del");
    await deleteServer(otherUserId, row.id);
    await expect(getServerForUser(otherUserId, row.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("testing a connection", () => {
  let mock: MockSsh;
  afterAll(async () => {
    await mock?.stop();
  });

  it("fails helpfully until the key is added, then pins the host key and probes", async () => {
    // The mock starts with no authorized keys: the user has not pasted ours yet.
    mock = await startMockSsh({ authorizedKeys: [] });
    const row = await createServer(userId, "sam-test", { host: "127.0.0.1", port: mock.port });

    const first = await testServer(userId, row.id);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.kind).toBe("auth");
      expect(first.error).toContain("SSH Keys page");
    }
    expect((await getServerForUser(userId, row.id)).status).toBe("error");

    // The user pastes the key into the Nest dashboard: restart with it authorised.
    await mock.stop();
    mock = await startMockSsh({ authorizedKeys: [row.publicKey] });
    await ctx.db.update(schema.servers).set({ port: mock.port }).where(eq(schema.servers.id, row.id));

    const second = await testServer(userId, row.id);
    expect(second.ok).toBe(true);
    const saved = await getServerForUser(userId, row.id);
    expect(saved.status).toBe("connected");
    expect(saved.lastError).toBeNull();
    expect(saved.hostKeyFingerprint).toBe(mock.hostKeyFingerprint);
    expect(saved.probe).toContain("uid");
  });

  it("refuses to talk to a host whose key changed after pinning", async () => {
    const row = await createServer(userId, "sam-pin", { host: "127.0.0.1", port: 1 });
    const impostor = await startMockSsh({ authorizedKeys: [row.publicKey] });
    await ctx.db
      .update(schema.servers)
      .set({ port: impostor.port, hostKeyFingerprint: "SHA256:" + "B".repeat(43) })
      .where(eq(schema.servers.id, row.id));

    const result = await testServer(userId, row.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("host-key");
    expect(impostor.commands).toEqual([]); // nothing was run on the impostor
    await impostor.stop();
  });
});
