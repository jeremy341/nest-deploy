import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import type { PipelineDeps } from "@/server/deploy/pipeline";
import {
  claimNextJob,
  failOrphanedJobs,
  recoverStaleJobs,
  startWorker,
} from "@/server/jobs";
import { cancelDeployment, createProject, deployBranch, type ProjectRow } from "@/server/projects";
import { connectToServer, createServer, getServerForUser } from "@/server/servers";
import { fakeBuilder, freePort, installFakeSystemd, nodeApp } from "@/server/test/fake-nest";
import { useFreshDb } from "@/server/test/db";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let serverId: string;
let a: ProjectRow;
let b: ProjectRow;

const base = {
  repoUrl: "https://github.com/example/demo",
  runtime: "node" as const,
  startCommand: "node server.js",
};

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  serverId = (await createServer(userId, "sam-r")).id;
  a = await createProject(userId, { ...base, serverId, name: "Alpha", port: 3001 });
  b = await createProject(userId, { ...base, serverId, name: "Beta", port: 3002 });
});
afterAll(async () => {
  await ctx.cleanup();
});

describe("queue", () => {
  it("claims jobs oldest first and never twice", async () => {
    const first = await deployBranch(userId, a.id);
    const second = await deployBranch(userId, b.id);
    const [x, y] = await Promise.all([claimNextJob("w1"), claimNextJob("w2")]);
    expect(x && y).toBeTruthy();
    expect(x!.id).not.toBe(y!.id);
    expect([x!.deploymentId, y!.deploymentId].sort()).toEqual([first.id, second.id].sort());
    expect(await claimNextJob("w3")).toBeNull();

    // finish them so later tests start clean
    await ctx.db.update(schema.jobs).set({ state: "done" });
  });

  it("runs one job per project at a time", async () => {
    const one = await deployBranch(userId, a.id);
    const two = await deployBranch(userId, a.id);
    const claimed = await claimNextJob("w1");
    expect(claimed?.deploymentId).toBe(one.id);
    // The second Alpha job must wait while the first is running.
    expect(await claimNextJob("w2")).toBeNull();

    await ctx.db.update(schema.jobs).set({ state: "done" }).where(eq(schema.jobs.id, claimed!.id));
    expect((await claimNextJob("w2"))?.deploymentId).toBe(two.id);
    await ctx.db.update(schema.jobs).set({ state: "done" });
  });

  it("does not run a canceled deployment", async () => {
    const dep = await deployBranch(userId, b.id);
    await cancelDeployment(userId, dep.id);
    expect(await claimNextJob("w1")).toBeNull();
    const row = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, dep.id)).get();
    expect(row?.state).toBe("canceled");
  });

  it("fails jobs left running by a dead worker and tells the user", async () => {
    const dep = await deployBranch(userId, a.id);
    const job = await claimNextJob("dead-worker");
    expect(job).toBeTruthy();
    await ctx.db
      .update(schema.deployments)
      .set({ state: "building" })
      .where(eq(schema.deployments.id, dep.id));

    expect(await failOrphanedJobs("dead-worker")).toBe(1);
    const row = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, dep.id)).get();
    expect(row?.state).toBe("error");
    expect(row?.error).toContain("worker restarted");
  });

  it("recovers jobs that have been running far too long", async () => {
    const dep = await deployBranch(userId, b.id);
    const job = await claimNextJob("slow");
    await ctx.db
      .update(schema.jobs)
      .set({ lockedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(schema.jobs.id, job!.id));
    expect(await recoverStaleJobs()).toBe(1);
    const row = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, dep.id)).get();
    expect(row?.state).toBe("error");
  });
});

describe("worker", () => {
  let mock: MockSsh;

  afterAll(async () => {
    await mock?.stop();
  });

  it("picks up a queued deployment and takes it live", async () => {
    // A real mock Nest, authorised for a fresh server's key.
    const srv = await createServer(userId, "sam-w", { host: "127.0.0.1", port: 1 });
    mock = await startMockSsh({ authorizedKeys: [srv.publicKey] });
    installFakeSystemd(mock);
    await ctx.db.update(schema.servers).set({ port: mock.port }).where(eq(schema.servers.id, srv.id));
    const refreshed = await getServerForUser(userId, srv.id);

    const project = await createProject(userId, {
      ...base,
      serverId: refreshed.id,
      name: "Worker Demo",
      port: await freePort(),
    });
    const dep = await deployBranch(userId, project.id);

    const deps: PipelineDeps = {
      build: fakeBuilder(() => nodeApp("worker")),
      connect: connectToServer,
      unitDir: `${mock.home}/units`,
      healthTimeoutSeconds: 8,
    };
    const worker = startWorker({ pollMs: 100, deps, onError: (e) => { throw e; } });

    const deadline = Date.now() + 15000;
    let state = "queued";
    while (Date.now() < deadline) {
      const row = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, dep.id)).get();
      state = row!.state;
      if (state === "ready" || state === "error") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await worker.stop();

    expect(state).toBe("ready");
    const job = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.deploymentId, dep.id)).get();
    expect(job?.state).toBe("done");
  });
});
