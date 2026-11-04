import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { schema } from "@/server/db";
import { runDeployJob, runRollbackJob, type PipelineDeps } from "@/server/deploy/pipeline";
import {
  createProject,
  deployBranch,
  deploymentLogs,
  listDeployments,
  rollback,
  setEnvVar,
  type ProjectRow,
} from "@/server/projects";
import { connectToServer, createServer, getServerForUser, type ServerRow } from "@/server/servers";
import { NestSession } from "@/server/ssh/connection";
import {
  brokenApp,
  fakeBuilder,
  freePort,
  installFakeSystemd,
  nodeApp,
  type FixtureFiles,
} from "@/server/test/fake-nest";
import { useFreshDb } from "@/server/test/db";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let mock: MockSsh;
let userId: string;
let server: ServerRow;
let project: ProjectRow;
let deps: PipelineDeps;
let files: FixtureFiles = nodeApp("v1");
const buildLogs: string[] = [];

async function sh(command: string) {
  const s = await NestSession.connect({
    host: "127.0.0.1",
    port: mock.port,
    username: "sam-r",
    privateKey: (await import("@/server/crypto")).open(server.privateKeyEnc, `server:${server.id}`),
  });
  try {
    return (await s.exec(command)).stdout.trim();
  } finally {
    s.close();
  }
}

async function deploy(branch = "main") {
  const dep = await deployBranch(userId, project.id, branch);
  await runDeployJob(dep.id, deps);
  if (process.env.DEBUG_DEPLOY) {
    const logs = await deploymentLogs(userId, dep.id);
    console.log(logs.map((l) => `[${l.level}] ${l.message}`).join("\n"));
  }
  return ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, dep.id)).get() as Promise<
    typeof schema.deployments.$inferSelect
  >;
}

const answer = (port: number) => sh(`curl -s --max-time 3 http://127.0.0.1:${port}/`);

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;

  mock = await startMockSsh({ authorizedKeys: [] });
  installFakeSystemd(mock);
  await mock.stop();

  // Create the server first so we know the key, then start the mock with it.
  server = await createServer(userId, "sam-r", { host: "127.0.0.1", port: 1 });
  mock = await startMockSsh({ authorizedKeys: [server.publicKey] });
  installFakeSystemd(mock);
  await ctx.db.update(schema.servers).set({ port: mock.port }).where(eq(schema.servers.id, server.id));
  server = await getServerForUser(userId, server.id);

  const port = await freePort();
  project = await createProject(userId, {
    serverId: server.id,
    name: "Demo App",
    repoUrl: "https://github.com/example/demo",
    runtime: "node",
    startCommand: "node server.js",
    port,
    healthPath: "/",
  });
  await setEnvVar(userId, project.id, { key: "GREETING", value: "hello-secret-value", target: "all" });

  deps = {
    build: fakeBuilder(() => files, { onBuild: (r) => buildLogs.push(r.branch ?? "") }),
    connect: connectToServer,
    unitDir: `${mock.home.replace(/\\/g, "/")}/units`,
    healthTimeoutSeconds: 8,
  };
});

afterAll(async () => {
  // Stop any fake services so their ports are released.
  for (const unit of await sh("ls $HOME/units 2>/dev/null || true").then((t) => t.split(/\s+/).filter(Boolean))) {
    await sh(`systemctl stop ${unit}`).catch(() => {});
  }
  await mock.stop();
  await ctx.cleanup();
});

describe("deploy pipeline", () => {
  let v1: typeof schema.deployments.$inferSelect;
  let v2: typeof schema.deployments.$inferSelect;

  it("ships a production release, starts it and passes the health check", async () => {
    files = nodeApp("v1");
    v1 = await deploy();
    expect(v1.state).toBe("ready");
    expect(v1.isCurrent).toBe(true);
    expect(v1.commitSha).toBe("a".repeat(40));
    expect(v1.archiveBytes).toBeGreaterThan(0);
    expect(await answer(project.port)).toBe("v1:hello-secret-value");
  });

  it("writes the service file, a locked-down env file and the current symlink", async () => {
    const home = mock.home.replace(/\\/g, "/");
    const unit = await sh(`cat ${home}/units/nd-demo-app.service`);
    expect(unit).toContain(`Environment=PORT=${project.port}`);
    expect(unit).toContain("Environment=HOST=0.0.0.0");
    expect(unit).toContain('ExecStart=/bin/bash -lc "exec node server.js"');
    expect(unit).toContain("Restart=always");

    const envFile = await sh(`cat ${home}/.nest-deploy/demo-app/releases/${v1.releaseId}/.env`);
    expect(envFile).toBe('GREETING="hello-secret-value"');
    const link = await sh(`readlink ${home}/.nest-deploy/demo-app/current`);
    expect(link.replace(/\\/g, "/")).toContain(v1.releaseId);
  });

  it("never stores secret values in the deployment log", async () => {
    const logs = await deploymentLogs(userId, v1.id);
    const text = logs.map((l) => l.message).join("\n");
    expect(text).toContain("build env: ***");
    expect(text).not.toContain("hello-secret-value");
    expect(text).toContain("Healthy");
    expect(text).toContain("Live on port");
  });

  it("deploys a second release and makes it current", async () => {
    files = nodeApp("v2");
    v2 = await deploy();
    expect(v2.state).toBe("ready");
    expect(v2.isCurrent).toBe(true);
    const all = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, v1.id)).get();
    expect(all?.isCurrent).toBe(false);
    expect(await answer(project.port)).toBe("v2:hello-secret-value");
  });

  it("rolls back to the first release without rebuilding", async () => {
    const before = mock.commands.length;
    const rb = await rollback(userId, v1.id);
    expect(rb.source).toBe("rollback");
    expect(rb.releaseId).toBe(v1.releaseId);
    await runRollbackJob(rb.id, deps);

    const done = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.id, rb.id)).get();
    expect(done?.state).toBe("ready");
    expect(done?.isCurrent).toBe(true);
    expect(await answer(project.port)).toBe("v1:hello-secret-value");
    expect(mock.commands.length).toBeGreaterThan(before);
  });

  it("reverts automatically when a new release is unhealthy", async () => {
    files = brokenApp();
    const bad = await deploy();
    expect(bad.state).toBe("error");
    expect(bad.isCurrent).toBe(false);
    expect(bad.error).toContain("did not become healthy");

    // Production is still answering with the release that was live before.
    expect(await answer(project.port)).toBe("v1:hello-secret-value");

    const text = (await deploymentLogs(userId, bad.id)).map((l) => l.message).join("\n");
    expect(text).toContain("Reverting to the previous release");
    expect(text).toContain("serving traffic again");
  });

  it("runs a preview on its own port and leaves production alone", async () => {
    files = nodeApp("preview");
    const pv = await deploy("feature/x");
    expect(pv.env).toBe("preview");
    expect(pv.state).toBe("ready");
    expect(pv.isCurrent).toBe(false);
    expect(pv.port).toBeGreaterThanOrEqual(20000);
    expect(await answer(pv.port)).toBe("preview:hello-secret-value");
    expect(await answer(project.port)).toBe("v1:hello-secret-value");
  });

  it("keeps only the newest previews", async () => {
    const ports: number[] = [];
    for (const n of [1, 2, 3]) {
      files = nodeApp(`p${n}`);
      ports.push((await deploy(`feature/${n}`)).port);
    }
    const previews = (await listDeployments(userId, project.id, 100)).filter(
      (r) => r.deployment.env === "preview" && r.deployment.state === "ready"
    );
    const active = previews.filter((r) => !r.deployment.cleanedUp);
    expect(active.length).toBe(2);
    // The oldest preview's service was stopped and its folder removed.
    expect(await answer(ports[0])).toBe("");
    expect(await answer(ports[2])).toBe("p3:hello-secret-value");
  });

  it("prunes old production releases but never the live one", async () => {
    for (let i = 0; i < 6; i++) {
      files = nodeApp(`r${i}`);
      await deploy();
    }
    const home = mock.home.replace(/\\/g, "/");
    const dirs = (await sh(`ls ${home}/.nest-deploy/demo-app/releases`)).split(/\s+/).filter(Boolean);
    const rows = await ctx.db.select().from(schema.deployments).where(eq(schema.deployments.projectId, project.id));
    const live = rows.find((r) => r.env === "production" && r.isCurrent)!;
    expect(dirs).toContain(live.releaseId);
    expect(dirs.length).toBeLessThanOrEqual(5 + 2); // 5 production + up to 2 previews
    expect(await answer(project.port)).toBe("r5:hello-secret-value");
    expect(rows.some((r) => r.cleanedUp && r.env === "production")).toBe(true);
  });

  it("refuses to roll back to a release that was pruned", async () => {
    await expect(rollback(userId, v1.id)).rejects.toMatchObject({ status: 409 });
  });
});
