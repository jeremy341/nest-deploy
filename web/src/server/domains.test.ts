import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertUser } from "@/server/auth/session";
import {
  addDomain,
  cnameTarget,
  dashboardInstructions,
  normalizeDomain,
  removeDomain,
  verifyDomain,
  type Resolver,
} from "@/server/domains";
import { createServer } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let serverId: string;

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  serverId = (await createServer(userId, "sam-r")).id;
});
afterAll(async () => {
  await ctx.cleanup();
});

const dnsError = (code: string) => Object.assign(new Error(code), { code });

describe("domain validation", () => {
  it("normalises valid names", () => {
    expect(normalizeDomain(" App.Example.COM. ")).toBe("app.example.com");
    expect(normalizeDomain("poorup.sam-r.hackclub.app")).toBe("poorup.sam-r.hackclub.app");
  });
  it("rejects URLs, IPs, paths and junk", () => {
    for (const bad of ["https://a.com", "1.2.3.4", "a.com/x", "localhost", "-a.com", "a..com", "a b.com", ""]) {
      expect(() => normalizeDomain(bad)).toThrow();
    }
  });
});

describe("instructions", () => {
  it("tells custom domains to add a CNAME, and Nest names to skip it", () => {
    const custom = dashboardInstructions("app.example.com", 3000, "sam-r");
    expect(custom.cname).toEqual({ name: "app.example.com", value: "sam-r.hackclub.app" });
    expect(custom.steps.join(" ")).toContain("target port to 3000");
    expect(dashboardInstructions("x.sam-r.hackclub.app", 3000, "sam-r").cname).toBeNull();
  });
});

describe("domain records", () => {
  it("adds, rejects duplicates, and removes", async () => {
    const { domain, instructions } = await addDomain(userId, { serverId, domain: "App.Example.com", port: 3000 });
    expect(domain.domain).toBe("app.example.com");
    expect(domain.status).toBe("pending");
    expect(instructions.cname?.value).toBe(cnameTarget("sam-r"));
    await expect(addDomain(userId, { serverId, domain: "app.example.com", port: 3001 })).rejects.toMatchObject({ status: 409 });
    await removeDomain(userId, domain.id);
    await expect(removeDomain(userId, domain.id)).rejects.toMatchObject({ status: 404 });
  });

  it("will not attach a domain to someone else's server", async () => {
    const other = (await upsertUser({ id: "u2", name: "Kim", email: null, slackId: null })).id;
    await expect(addDomain(other, { serverId, domain: "kim.example.com", port: 3000 })).rejects.toMatchObject({ status: 404 });
  });
});

describe("DNS check", () => {
  const resolver = (cname: string[] | Error, a: string[] | Error = []): Resolver => ({
    resolveCname: async () => {
      if (cname instanceof Error) throw cname;
      return cname;
    },
    resolve4: async () => {
      if (a instanceof Error) throw a;
      return a;
    },
  });

  it("is valid when the CNAME points at the Nest account", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "ok.example.com", port: 3000 });
    const r = await verifyDomain(userId, domain.id, resolver(["sam-r.hackclub.app."]));
    expect(r.status).toBe("valid");
  });

  it("explains a CNAME that points elsewhere", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "bad.example.com", port: 3000 });
    const r = await verifyDomain(userId, domain.id, resolver(["someone-else.hackclub.app"]));
    expect(r.status).toBe("invalid");
    expect(r.reason).toContain("sam-r.hackclub.app");
  });

  it("says when nothing is configured yet", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "new.example.com", port: 3000 });
    const r = await verifyDomain(userId, domain.id, resolver(dnsError("ENODATA")));
    expect(r.status).toBe("invalid");
    expect(r.reason).toContain("No CNAME found");
  });

  it("accepts a name Nest hands out once it resolves", async () => {
    const { domain } = await addDomain(userId, { serverId, domain: "poorup.sam-r.hackclub.app", port: 8080 });
    const r = await verifyDomain(userId, domain.id, resolver(dnsError("ENODATA"), ["203.0.113.7"]));
    expect(r.status).toBe("valid");
  });
});
