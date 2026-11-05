import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/server/auth/session";
import { upsertUser } from "@/server/auth/session";
import { resetConfigForTests } from "@/server/config";
import { open } from "@/server/crypto";
import { schema } from "@/server/db";
import {
  classifyInventory,
  getInventory,
  parseOrphanId,
  portConflicts,
  removeOrphans,
  type PreviewInfo,
  type ProjectInfo,
} from "@/server/inventory";
import { createProject } from "@/server/projects";
import { createServer, getServerForUser, type ServerRow } from "@/server/servers";
import { NestSession } from "@/server/ssh/connection";
import type { InventoryUnit, ListeningPort, RawInventory } from "@/server/ssh/inventory-probe";
import { useFreshDb } from "@/server/test/db";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";

// The routes read the signed-in user from the session cookie; tests set it directly.
let signedIn: SessionUser | null = null;
vi.mock("@/server/auth/current", () => ({
  getCurrentUser: async () => signedIn,
}));

// ------------------------------------------------------------ pure pieces

const unit = (name: string, extra: Partial<InventoryUnit> = {}): InventoryUnit => ({
  name,
  state: "running",
  detail: "running",
  loadState: "loaded",
  mainPid: null,
  unitFile: `/etc/systemd/system/${name}`,
  execStart: null,
  controlGroup: null,
  ...extra,
});

const listening = (port: number, extra: Partial<ListeningPort> = {}): ListeningPort => ({
  port,
  addresses: ["0.0.0.0"],
  process: null,
  pid: null,
  cgroups: [],
  ...extra,
});

const raw = (extra: Partial<RawInventory> = {}): RawInventory => ({
  home: "/home/sam",
  unitDir: "/etc/systemd/system",
  hasSystemctl: true,
  disk: { totalMb: 10240, usedMb: 2048 },
  units: [],
  folders: [],
  ports: [],
  portsSource: "ss",
  portsHaveProcesses: true,
  ...extra,
});

const blog: ProjectInfo = { id: "p-blog", slug: "blog", name: "Blog", port: 3000 };
const shop: ProjectInfo = { id: "p-shop", slug: "shop", name: "Shop", port: 3001 };
const server = { id: "s1", name: "sam.hackclub.app" };

describe("classifyInventory", () => {
  it("calls a unit with a matching project managed, and one without an orphan", () => {
    const inv = classifyInventory(
      raw({
        units: [unit("nd-blog.service"), unit("nd-old.service", { state: "failed" })],
        folders: [
          { name: "blog", sizeKb: 2048, isLink: false },
          { name: "old", sizeKb: 512, isLink: false },
          { name: "Not_A_Slug", sizeKb: 1, isLink: false },
        ],
      }),
      [blog],
      [],
      server
    );
    expect(inv.projects).toHaveLength(1);
    expect(inv.projects[0]).toMatchObject({
      slug: "blog",
      service: { unit: "nd-blog.service", state: "running" },
      folderKb: 2048,
      portStatus: "free",
    });
    expect(inv.orphans.map((o) => [o.id, o.kind])).toEqual([
      ["old", "folder"],
      ["nd-old.service", "service"],
    ]);
    // The project's own folder and unit are never offered for removal.
    expect(inv.orphans.some((o) => o.id === "blog" || o.id === "nd-blog.service")).toBe(false);
    // A folder whose name Nest Deploy could not have made is not a candidate at all.
    expect(inv.orphans.some((o) => o.id === "Not_A_Slug")).toBe(false);
  });

  it("keeps a project that has no service yet", () => {
    const inv = classifyInventory(raw(), [blog], [], server);
    expect(inv.projects[0].service).toBeNull();
    expect(inv.orphans).toEqual([]);
  });

  it("marks a link folder as not removable", () => {
    const inv = classifyInventory(raw({ folders: [{ name: "odd", sizeKb: null, isLink: true }] }), [], [], server);
    expect(inv.orphans[0]).toMatchObject({ id: "odd", removable: false });
  });

  describe("previews", () => {
    const previews: PreviewInfo[] = [
      { projectId: blog.id, releaseId: "0a1b2c3d-0000-4000-8000-000000000000", port: 20001, branch: "feat" },
    ];
    const units = [
      unit("nd-blog.service"),
      unit("nd-blog-pv-0a1b2c3d.service"), // has a deployment record
      unit("nd-blog-pv-deadbeef.service"), // project exists, no record
      unit("nd-ghost-pv-12345678.service"), // no such project
    ];

    it("matches previews to deployments and flags the rest as orphan previews", () => {
      const inv = classifyInventory(raw({ units }), [blog], previews, server);
      expect(inv.projects[0].previews).toEqual([
        expect.objectContaining({ unit: "nd-blog-pv-0a1b2c3d.service", branch: "feat", port: 20001 }),
      ]);
      expect(inv.orphans.map((o) => [o.id, o.kind])).toEqual([
        ["nd-blog-pv-deadbeef.service", "preview"],
        ["nd-ghost-pv-12345678.service", "preview"],
      ]);
    });

    it("does not let a project slug that looks like a preview be mistaken for one", () => {
      const odd: ProjectInfo = { id: "p-odd", slug: "blog-pv-deadbeef", name: "Odd", port: 3005 };
      const inv = classifyInventory(raw({ units: [unit("nd-blog-pv-deadbeef.service")] }), [blog, odd], [], server);
      expect(inv.orphans).toEqual([]);
      expect(inv.projects.find((p) => p.slug === odd.slug)?.service?.unit).toBe("nd-blog-pv-deadbeef.service");
    });
  });

  describe("ports", () => {
    it("gives a port to the unit that owns the process, by pid or by cgroup", () => {
      const inv = classifyInventory(
        raw({
          units: [
            unit("nd-blog.service", { mainPid: 100 }),
            unit("nd-shop.service", { controlGroup: "/system.slice/nd-shop.service" }),
            unit("nd-old.service", { mainPid: 300 }),
          ],
          ports: [
            listening(3000, { pid: 100, process: "node" }),
            listening(3001, { pid: 201, process: "node", cgroups: ["/system.slice/nd-shop.service/app"] }),
            listening(4000, { pid: 300, process: "python3" }),
          ],
        }),
        [blog, shop],
        [],
        server
      );
      expect(inv.ports.map((p) => p.owner.type)).toEqual(["project", "project", "orphan"]);
      expect(inv.conflicts).toEqual([]);
      expect(inv.projects.map((p) => p.portStatus)).toEqual(["own", "own"]);
      expect(inv.orphans.find((o) => o.id === "nd-old.service")?.ports).toEqual([4000]);
      expect(inv.otherPorts).toEqual([]); // everything is accounted for
    });

    it("lists unrelated listeners as other ports", () => {
      const inv = classifyInventory(
        raw({ ports: [listening(22, { process: "sshd", pid: 9 }), listening(5432, { process: "postgres", pid: 11 })] }),
        [blog],
        [],
        server
      );
      expect(inv.otherPorts.map((p) => [p.port, p.process])).toEqual([
        [22, "sshd"],
        [5432, "postgres"],
      ]);
      expect(inv.conflicts).toEqual([]);
    });

    it("warns when a project's port is held by something that is not its own unit", () => {
      const inv = classifyInventory(
        raw({
          units: [unit("nd-blog.service", { mainPid: 100 })],
          ports: [listening(3000, { process: "ruby", pid: 777, cgroups: ["/user.slice"] })],
        }),
        [blog],
        [],
        server
      );
      expect(inv.conflicts).toEqual([
        expect.objectContaining({ slug: "blog", port: 3000, heldBy: { kind: "other", label: "ruby", pid: 777 } }),
      ]);
      expect(inv.projects[0].portStatus).toBe("clash");
      expect(inv.otherPorts.map((p) => p.port)).toEqual([3000]);
    });

    it("warns when the port is taken and the project's service is not running", () => {
      const inv = classifyInventory(
        raw({
          units: [unit("nd-blog.service", { state: "stopped" })],
          ports: [listening(3000)], // no process name readable
        }),
        [blog],
        [],
        server
      );
      expect(inv.conflicts).toHaveLength(1);
      expect(inv.conflicts[0].heldBy).toMatchObject({ kind: "other", label: "another process" });
    });

    it("does not cry wolf when process names are unreadable and the service is up", () => {
      const inv = classifyInventory(
        raw({
          portsHaveProcesses: false,
          units: [unit("nd-blog.service")],
          ports: [listening(3000)],
        }),
        [blog],
        [],
        server
      );
      expect(inv.conflicts).toEqual([]);
      expect(inv.projects[0].portStatus).toBe("own");
    });

    it("flags a project port held by an orphan service", () => {
      const inv = classifyInventory(
        raw({
          units: [unit("nd-old.service", { mainPid: 300 })],
          ports: [listening(3000, { pid: 300, process: "node" })],
        }),
        [blog],
        [],
        server
      );
      expect(inv.conflicts[0].heldBy).toEqual({ kind: "orphan", label: "nd-old.service", pid: 300 });
    });

    it("reports whether ports could be read at all", () => {
      expect(classifyInventory(raw({ portsSource: "none" }), [], [], server).portsKnown).toBe(false);
      expect(classifyInventory(raw(), [], [], server).portsKnown).toBe(true);
    });
  });
});

describe("portConflicts", () => {
  const ports = classifyInventory(
    raw({
      units: [unit("nd-blog.service", { mainPid: 100 })],
      ports: [listening(3000, { pid: 100, process: "node" }), listening(8080, { pid: 5, process: "nginx" })],
    }),
    [blog],
    [],
    server
  ).ports;

  it("finds nothing for a project on its own port", () => {
    expect(portConflicts([blog], { ports })).toEqual([]);
  });

  it("checks a port the user has not saved yet", () => {
    const edited = { ...blog, port: 8080 };
    expect(portConflicts([edited], { ports })).toEqual([
      expect.objectContaining({ projectId: "p-blog", port: 8080, heldBy: { kind: "other", label: "nginx", pid: 5 } }),
    ]);
  });

  it("treats another project's service as a conflict", () => {
    const moved = { ...shop, port: 3000 };
    const [c] = portConflicts([moved], { ports });
    expect(c.heldBy).toMatchObject({ kind: "project", label: "nd-blog" });
  });

  it("is quiet when the port is free", () => {
    expect(portConflicts([{ ...blog, port: 9999 }], { ports })).toEqual([]);
  });
});

describe("parseOrphanId", () => {
  it("accepts unit names and folder names Nest Deploy could have made", () => {
    expect(parseOrphanId("nd-blog.service")).toEqual({ kind: "unit", unit: "nd-blog.service" });
    expect(parseOrphanId("nd-blog-pv-0a1b2c3d.service")).toEqual({
      kind: "unit",
      unit: "nd-blog-pv-0a1b2c3d.service",
    });
    expect(parseOrphanId("blog")).toEqual({ kind: "folder", name: "blog" });
    expect(parseOrphanId("my-app-2")).toEqual({ kind: "folder", name: "my-app-2" });
  });

  it("rejects traversal, slashes and anything shell-shaped", () => {
    const bad = [
      "",
      ".",
      "..",
      "../etc",
      "..%2Fetc",
      "a/b",
      "/etc/passwd",
      "blog/../../x",
      "nd-../x.service",
      "nd-a/b.service",
      "nd-.service",
      "nd--x.service",
      "nd-x-.service",
      "ssh.service",
      "nd-blog.service/..",
      "nd-blog.service ",
      " blog",
      "blog;rm -rf /",
      "$(id)",
      "`id`",
      "-rf",
      "Blog",
      "blog\n",
      "nd-blog.service\nnd-other.service",
      "x".repeat(200),
    ];
    for (const id of bad) expect(parseOrphanId(id), JSON.stringify(id)).toBeNull();
    for (const id of [null, undefined, 3, {}, ["blog"]]) expect(parseOrphanId(id)).toBeNull();
  });
});

// ------------------------------------------------------- with a container

let ctx: Awaited<ReturnType<typeof useFreshDb>>;
let userId: string;
let otherUserId: string;
let row: ServerRow;
let mock: MockSsh;
const asUser = (id: string, name: string): SessionUser => ({ id, name }) as SessionUser;

async function sh(command: string) {
  const key = open(row.privateKeyEnc, `server:${row.id}`);
  const s = await NestSession.connect({ host: "127.0.0.1", port: mock.port, username: "x", privateKey: key });
  try {
    return (await s.exec(command)).stdout;
  } finally {
    s.close();
  }
}

const exists = async (path: string) => (await sh(`[ -e ${path} ] && echo yes || echo no`)).trim() === "yes";

beforeAll(async () => {
  ctx = await useFreshDb();
  userId = (await upsertUser({ id: "u1", name: "Sam", email: null, slackId: null })).id;
  otherUserId = (await upsertUser({ id: "u2", name: "Kim", email: null, slackId: null })).id;

  row = await createServer(userId, "sam-r", { host: "127.0.0.1", port: 1 });
  mock = await startMockSsh({ authorizedKeys: [row.publicKey] });
  await ctx.db.update(schema.servers).set({ port: mock.port }).where(eq(schema.servers.id, row.id));
  row = await getServerForUser(userId, row.id);

  // A systemd that knows just enough for the inventory and the cleanup.
  mock.addShim(
    "systemctl",
    `unit="\${2:-}"; f="$HOME/units/$unit"
case "$1" in
  show) echo "LoadState=$([ -f "$f" ] && echo loaded || echo not-found)"; echo "ActiveState=active"; echo "SubState=running"; echo "MainPID=0";;
  *) exit 0;;
esac`
);
  process.env.UNIT_DIR = `${mock.home}/units`;
  resetConfigForTests();

  // Project "blog" with its service, folder and one preview; the rest is left over.
  await createProject(userId, {
    serverId: row.id,
    name: "Blog",
    slug: "blog",
    repoUrl: "https://github.com/example/blog",
    runtime: "node",
    startCommand: "node server.js",
    port: 3100,
  });
  const unitBody = '[Service]\nExecStart=/bin/bash -lc "exec node old.js"\n';
  for (const name of ["nd-blog.service", "nd-old.service", "nd-ghost-pv-12345678.service"]) {
    mock.writeFile(`${mock.home}/units/${name}`, unitBody);
  }
  for (const dir of ["blog/releases/r1", "old/releases/r1", "stray/shared"]) {
    mock.writeFile(`${mock.home}/.nest-deploy/${dir}/file.txt`, "hello world");
  }
});

afterAll(async () => {
  delete process.env.UNIT_DIR;
  resetConfigForTests();
  await mock?.stop();
  await ctx.cleanup();
});

describe("getInventory on a container", () => {
  it("reads the container in one round trip and sorts out what is whose", async () => {
    const before = mock.commands.length;
    const inv = await getInventory(userId, row.id);
    expect(mock.commands.length - before).toBe(1);

    expect(inv.serverName).toBe("127.0.0.1");
    expect(inv.disk?.totalMb).toBeGreaterThan(0);
    expect(inv.projects.map((p) => [p.slug, p.service?.unit ?? null, p.folderKb !== null])).toEqual([
      ["blog", "nd-blog.service", true],
    ]);
    expect(inv.orphans.map((o) => o.id).sort()).toEqual(
      ["nd-ghost-pv-12345678.service", "nd-old.service", "old", "stray"].sort()
    );
    expect(inv.orphans.find((o) => o.id === "nd-old.service")?.execStart).toBe(
      '/bin/bash -lc "exec node old.js"'
    );
  });

  it("changes nothing on the container", async () => {
    const list = async () => (await sh("cd $HOME && find . -path ./.shims -prune -o -type f -print | sort")).trim();
    const before = await list();
    await getInventory(userId, row.id);
    expect(await list()).toBe(before);
  });

  it("will not read a server that belongs to someone else", async () => {
    await expect(getInventory(otherUserId, row.id)).rejects.toMatchObject({ status: 404 });
  });

  it("returns a plain error, not a crash, when the container cannot be reached", async () => {
    const dead = await createServer(userId, "sam-dead", { host: "127.0.0.1", port: 1 });
    await expect(getInventory(userId, dead.id)).rejects.toMatchObject({
      status: 502,
      code: "upstream",
    });
  });
});

describe("removeOrphans", () => {
  it("refuses a managed project's unit and folder even when asked by name", async () => {
    const results = await removeOrphans(userId, row.id, ["nd-blog.service", "blog"]);
    expect(results.map((r) => r.status)).toEqual(["refused", "refused"]);
    expect(await exists("$HOME/units/nd-blog.service")).toBe(true);
    expect(await exists("$HOME/.nest-deploy/blog/releases/r1/file.txt")).toBe(true);
  });

  it("rejects traversal and malformed names without touching anything", async () => {
    const before = mock.commands.length;
    const results = await removeOrphans(userId, row.id, ["../..", "a/b", "nd-../x.service", "/etc", "Old"]);
    expect(results.every((r) => r.status === "refused")).toBe(true);
    expect(mock.commands.length).toBe(before); // never even connected
    expect(await exists("$HOME/.nest-deploy/old")).toBe(true);
  });

  it("will not act on another user's server", async () => {
    await expect(removeOrphans(otherUserId, row.id, ["nd-old.service"])).rejects.toMatchObject({ status: 404 });
    expect(await exists("$HOME/units/nd-old.service")).toBe(true);
  });

  it("removes orphan services and folders, one result each, and audits every one", async () => {
    const results = await removeOrphans(userId, row.id, [
      "nd-old.service",
      "old",
      "stray",
      "nd-ghost-pv-12345678.service",
      "nd-old.service", // duplicate is collapsed
      "nd-gone.service", // not there at all
    ]);
    expect(results.map((r) => [r.id, r.status])).toEqual([
      ["nd-old.service", "removed"],
      ["old", "removed"],
      ["stray", "removed"],
      ["nd-ghost-pv-12345678.service", "removed"],
      ["nd-gone.service", "gone"],
    ]);

    expect(await exists("$HOME/units/nd-old.service")).toBe(false);
    expect(await exists("$HOME/units/nd-ghost-pv-12345678.service")).toBe(false);
    expect(await exists("$HOME/.nest-deploy/old")).toBe(false);
    expect(await exists("$HOME/.nest-deploy/stray")).toBe(false);
    // The project is untouched.
    expect(await exists("$HOME/units/nd-blog.service")).toBe(true);
    expect(await exists("$HOME/.nest-deploy/blog/releases/r1/file.txt")).toBe(true);

    const entries = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "container.orphan_remove"));
    expect(entries).toHaveLength(4);
    for (const e of entries) {
      expect(e.userId).toBe(userId);
      expect(e.meta).not.toContain("hello world");
      expect(Object.keys(JSON.parse(e.meta!)).sort()).toEqual(["kind", "name", "server"]);
    }
    expect(entries.map((e) => JSON.parse(e.meta!).name).sort()).toEqual(
      ["nd-ghost-pv-12345678.service", "nd-old.service", "old", "stray"].sort()
    );

    const after = await getInventory(userId, row.id);
    expect(after.orphans).toEqual([]);
  });
});

describe("the routes", () => {
  type Ctx = { params: Promise<{ id: string }> };
  const params = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
  const post = (id: string, body: unknown, origin = "http://localhost:3000") =>
    new NextRequest(`http://localhost:3000/api/servers/${id}/orphans`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });

  it("require sign-in", async () => {
    signedIn = null;
    const { GET } = await import("@/app/api/servers/[id]/inventory/route");
    const { POST } = await import("@/app/api/servers/[id]/orphans/route");
    expect((await GET(new NextRequest("http://localhost:3000/x"), params(row.id))).status).toBe(401);
    expect((await POST(post(row.id, { ids: ["old"] }), params(row.id))).status).toBe(401);
  });

  it("return 404 for a server that is not the signed-in user's, and never touch it", async () => {
    signedIn = asUser(otherUserId, "Kim");
    const { GET } = await import("@/app/api/servers/[id]/inventory/route");
    const { POST } = await import("@/app/api/servers/[id]/orphans/route");
    const before = mock.commands.length;
    expect((await GET(new NextRequest("http://localhost:3000/x"), params(row.id))).status).toBe(404);
    expect((await POST(post(row.id, { ids: ["nd-old.service"] }), params(row.id))).status).toBe(404);
    expect(mock.commands.length).toBe(before);
  });

  it("serve the inventory and validate the body for the owner", async () => {
    signedIn = asUser(userId, "Sam");
    const { GET } = await import("@/app/api/servers/[id]/inventory/route");
    const { POST } = await import("@/app/api/servers/[id]/orphans/route");

    const res = await GET(new NextRequest("http://localhost:3000/x"), params(row.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.inventory.projects[0].slug).toBe("blog");

    expect((await POST(post(row.id, { ids: [] }), params(row.id))).status).toBe(400);
    expect((await POST(post(row.id, { nope: 1 }), params(row.id))).status).toBe(400);
    const refused = await POST(post(row.id, { ids: ["../../etc"] }), params(row.id));
    expect(refused.status).toBe(200);
    expect((await refused.json()).results[0].status).toBe("refused");
  });

  it("reject a cross-origin write", async () => {
    signedIn = asUser(userId, "Sam");
    const { POST } = await import("@/app/api/servers/[id]/orphans/route");
    const res = await POST(post(row.id, { ids: ["old"] }, "https://evil.example"), params(row.id));
    expect(res.status).toBe(403);
  });

  it("answer an unreachable container with a plain error, not a 500", async () => {
    signedIn = asUser(userId, "Sam");
    const dead = (await ctx.db.select().from(schema.servers).where(eq(schema.servers.nestUsername, "sam-dead")))[0];
    const { GET } = await import("@/app/api/servers/[id]/inventory/route");
    const res = await GET(new NextRequest("http://localhost:3000/x"), params(dead.id));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("upstream");
    expect(JSON.stringify(json)).not.toContain("at ");
  });
});
