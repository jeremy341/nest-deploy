import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertUser } from "@/server/auth/session";
import { addDomain, checkDomainApp } from "@/server/domains";
import type { Probe } from "@/server/app-check";
import {
  createProject,
  getCloneSettings,
  listCloneSources,
  setEnvVar,
  updateProject,
} from "@/server/projects";
import { createServer, listServers } from "@/server/servers";
import { useFreshDb } from "@/server/test/db";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherId: string;
let a: string;
let b: string;
let onOtherServer: string;
let foreign: string;

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  otherId = (await upsertUser({ id: "u2", name: "Alex", email: null, slackId: null })).id;
  const s1 = (await createServer(userId, "sam-r")).id;
  const s2 = (await createServer(userId, "sam-two")).id;
  const s3 = (await createServer(otherId, "alex-r")).id;
  const base = { repoUrl: "https://github.com/sam/app.git", runtime: "node" as const };
  a = (await createProject(userId, { ...base, serverId: s1, name: "A", slug: "a", port: 3000 })).id;
  b = (await createProject(userId, { ...base, serverId: s1, name: "B", slug: "b", port: 3100 })).id;
  onOtherServer = (await createProject(userId, { ...base, serverId: s2, name: "C", slug: "c", port: 3200 })).id;
  foreign = (await createProject(otherId, { ...base, serverId: s3, name: "D", slug: "d", port: 3300 })).id;

  await updateProject(userId, b, {
    runtime: "python",
    installCommand: "pip install -r requirements.txt",
    buildCommand: "make",
    startCommand: "python3 app.py",
    rootDir: "services/api",
    healthPath: "/healthz",
  });
  await setEnvVar(userId, b, { key: "SECRET_KEY", value: "hunter2" });
});
afterAll(async () => {
  await ctx.cleanup();
});

describe("clone sources", () => {
  it("lists only other projects on the same server", async () => {
    const list = await listCloneSources(userId, a);
    expect(list.map((p) => p.id)).toEqual([b]);
  });

  it("returns build and run settings and nothing else", async () => {
    const s = await getCloneSettings(userId, a, b);
    expect(s).toEqual({
      runtime: "python",
      installCommand: "pip install -r requirements.txt",
      buildCommand: "make",
      startCommand: "python3 app.py",
      outputDir: null,
      rootDir: "services/api",
      healthPath: "/healthz",
    });
    expect(JSON.stringify(s)).not.toContain("hunter2");
  });

  it("does not write anything to the target project", async () => {
    await getCloneSettings(userId, a, b);
    const after = await listCloneSources(userId, b);
    expect(after.map((p) => p.id)).toEqual([a]);
    const s = await getCloneSettings(userId, b, a);
    expect(s.runtime).toBe("node");
    expect(s.rootDir).toBe(".");
  });

  it("refuses other servers, other users and itself", async () => {
    await expect(getCloneSettings(userId, a, onOtherServer)).rejects.toThrow(/same server/);
    await expect(getCloneSettings(userId, a, foreign)).rejects.toThrow(/not found/i);
    await expect(getCloneSettings(userId, foreign, a)).rejects.toThrow(/not found/i);
    await expect(getCloneSettings(userId, a, a)).rejects.toThrow(/different project/);
  });
});

describe("checkDomainApp ownership and health path", () => {
  it("uses the project's health path and refuses other users' domains", async () => {
    const servers = await listServers(userId);
    const { domain } = await addDomain(userId, {
      serverId: servers[0].id,
      domain: "app.example.com",
      port: 3100,
      projectId: b,
    });
    const asked: string[] = [];
    const probe: Probe = async (d, path) => {
      asked.push(`${d}${path}`);
      return { kind: "response", statusCode: 200, tlsVerified: true };
    };

    const skipped = await checkDomainApp(userId, domain.id, "invalid", probe);
    expect(skipped.skipped).toBe(true);
    expect(skipped.certificateLabel).toBe("Certificate not verified yet");
    expect(asked).toEqual([]);

    const ran = await checkDomainApp(userId, domain.id, "valid", probe);
    expect(ran.skipped).toBe(false);
    expect(asked).toEqual(["app.example.com/", "app.example.com/healthz"]);

    await expect(checkDomainApp(otherId, domain.id, "valid", probe)).rejects.toThrow(/not found/i);
  });
});
