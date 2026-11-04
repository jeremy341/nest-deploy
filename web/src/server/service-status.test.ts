import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { upsertUser } from "@/server/auth/session";
import { open } from "@/server/crypto";
import { schema } from "@/server/db";
import { runDeployJob, type PipelineDeps } from "@/server/deploy/pipeline";
import { createProject, deployBranch, type ProjectRow } from "@/server/projects";
import { fetchServiceStatus, parseServiceStatus } from "@/server/service-status";
import { connectToServer, createServer, getServerForUser, type ServerRow } from "@/server/servers";
import { NestSession } from "@/server/ssh/connection";
import { fakeBuilder, freePort, installFakeSystemd, nodeApp } from "@/server/test/fake-nest";
import { useFreshDb } from "@/server/test/db";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";

describe("parseServiceStatus", () => {
  const running = [
    "ND_ACTIVE=active",
    "ND_LoadState=loaded",
    "ND_ActiveState=active",
    "ND_SubState=running",
    "ND_MainPID=4242",
    "ND_NRestarts=2",
    "ND_MemoryCurrent=88080384",
    "ND_ActiveEnterTimestampMonotonic=1000000000",
    "ND_UPTIME=1000.50",
    "ND_HTTP=200 0.0123",
  ].join("\n");

  it("reads a healthy service", () => {
    const at = new Date("2026-11-04T12:00:00Z");
    expect(parseServiceStatus(running, at)).toEqual({
      state: "running",
      detail: "running",
      pid: 4242,
      uptimeSeconds: 1, // 1000.5 s since boot minus 1000 s when it started, rounded
      memoryMb: 84,
      restarts: 2,
      http: { code: 200, ms: 12 },
      checkedAt: at.toISOString(),
    });
  });

  it("calls a service that failed, failed", () => {
    const s = parseServiceStatus(
      "ND_ActiveState=failed\nND_SubState=failed\nND_MainPID=0\nND_MemoryCurrent=18446744073709551615\nND_HTTP=000 0.000"
    );
    expect(s).toMatchObject({ state: "failed", pid: null, memoryMb: null, uptimeSeconds: null });
    expect(s.http).toEqual({ code: 0, ms: null });
  });

  it("tells a missing unit from a stopped one", () => {
    expect(parseServiceStatus("ND_LoadState=not-found\nND_ActiveState=inactive").state).toBe("not_deployed");
    expect(parseServiceStatus("ND_LoadState=loaded\nND_ActiveState=inactive").state).toBe("stopped");
    expect(parseServiceStatus("ND_ActiveState=activating\nND_SubState=auto-restart").state).toBe("starting");
  });

  it("copes with garbage and with a missing curl", () => {
    const s = parseServiceStatus("hello\nND_MemoryCurrent=[not set]\nND_MainPID=abc\nND_HTTP=oops");
    expect(s).toMatchObject({ state: "unknown", memoryMb: null, pid: null, http: null });
    expect(parseServiceStatus("").state).toBe("unknown");
  });

  it("ignores lines that are not ours", () => {
    expect(parseServiceStatus("ActiveState=active\nND_ACTIVE=failed").state).toBe("failed");
  });
});

describe("fetchServiceStatus on a mock Nest", () => {
  let ctx: Awaited<ReturnType<typeof useFreshDb>>;
  let mock: MockSsh;
  let userId: string;
  let server: ServerRow;
  let project: ProjectRow;
  let neverDeployed: ProjectRow;
  let deps: PipelineDeps;

  async function sh(command: string) {
    const s = await NestSession.connect({
      host: "127.0.0.1",
      port: mock.port,
      username: "sam-r",
      privateKey: open(server.privateKeyEnc, `server:${server.id}`),
    });
    try {
      return (await s.exec(command)).stdout.trim();
    } finally {
      s.close();
    }
  }

  beforeAll(async () => {
    ctx = await useFreshDb();
    userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
    server = await createServer(userId, "sam-r", { host: "127.0.0.1", port: 1 });
    mock = await startMockSsh({ authorizedKeys: [server.publicKey] });
    installFakeSystemd(mock);
    await ctx.db.update(schema.servers).set({ port: mock.port }).where(eq(schema.servers.id, server.id));
    server = await getServerForUser(userId, server.id);

    const base = { serverId: server.id, repoUrl: "https://github.com/example/demo", runtime: "node" as const };
    project = await createProject(userId, {
      ...base,
      name: "Status App",
      startCommand: "node server.js",
      port: await freePort(),
    });
    neverDeployed = await createProject(userId, { ...base, name: "Idle", startCommand: "node server.js", port: await freePort() });
    deps = {
      build: fakeBuilder(() => nodeApp("v1")),
      connect: connectToServer,
      unitDir: `${mock.home.replace(/\\/g, "/")}/units`,
      healthTimeoutSeconds: 8,
    };
  });

  afterAll(async () => {
    for (const unit of (await sh("ls $HOME/units 2>/dev/null || true")).split(/\s+/).filter(Boolean)) {
      await sh(`systemctl stop ${unit}`).catch(() => {});
    }
    await mock.stop();
    await ctx.cleanup();
  });

  it("says not deployed for a project that never ran", async () => {
    const s = await fetchServiceStatus(userId, neverDeployed.id);
    expect(s.state).toBe("not_deployed");
  });

  it("reports a running service with its memory and a real answer from the app", async () => {
    const dep = await deployBranch(userId, project.id);
    await runDeployJob(dep.id, deps);
    const s = await fetchServiceStatus(userId, project.id);
    expect(s.state).toBe("running");
    expect(s.pid).toBeGreaterThan(0);
    expect(s.memoryMb).toBeGreaterThan(1);
    expect(s.uptimeSeconds).not.toBeNull();
    expect(s.uptimeSeconds!).toBeLessThan(120);
    expect(s.http?.code).toBe(200);
  });

  it("notices when the service has stopped", async () => {
    await sh("systemctl stop nd-status-app.service");
    const s = await fetchServiceStatus(userId, project.id);
    expect(["failed", "stopped"]).toContain(s.state);
    expect(s.http?.code).toBe(0);
  });

  it("belongs to the owner", async () => {
    const other = (await upsertUser({ id: "u2", name: "Alex", email: null, slackId: null })).id;
    await expect(fetchServiceStatus(other, project.id)).rejects.toMatchObject({ status: 404 });
  });
});
