// Fill the local database with realistic sample data, so every dashboard page
// can be seen populated without a Nest account or real deploys.
//
//   pnpm seed:demo           add (or refresh) the sample data
//   pnpm seed:demo --reset   remove it again
//
// Everything belongs to the development sign-in user "dev" (sign in with the
// Development sign-in form, name "dev"). Every row id starts with "demo-", so
// the reset removes exactly what this script made and nothing else.
//
// The sample server points at 127.0.0.1 port 1, where nothing listens, so the
// background monitor and the Service card fail fast instead of trying to reach
// a real Nest container. Live readings (Service card, runtime logs) therefore
// show a connection error; everything stored in the database shows normally.
import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { upsertUser } from "../src/server/auth/session";
import { seal, sha256Hex } from "../src/server/crypto";
import { getDb, schema } from "../src/server/db";
import { generateServerKey } from "../src/server/ssh/keys";

const SERVER_ID = "demo-server";
const DAY = 86_400_000;
const MIN = 60_000;

// Deterministic randomness, so the charts look the same on every run.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(341);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const sha = () => Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");

async function reset() {
  const db = await getDb();
  const projects = await db.select({ id: schema.projects.id }).from(schema.projects).where(like(schema.projects.id, "demo-%"));
  const ids = projects.map((p) => p.id);
  if (ids.length) await db.delete(schema.auditLog).where(inArray(schema.auditLog.target, ids));
  await db.delete(schema.auditLog).where(like(schema.auditLog.target, "demo-%"));
  // Projects, deployments, logs, variables, samples, page views and domains all cascade from the server.
  await db.delete(schema.servers).where(eq(schema.servers.id, SERVER_ID));
  return ids.length;
}

type ProjectSeed = {
  id: string;
  slug: string;
  name: string;
  repo: string;
  runtime: "node" | "python" | "static" | "command";
  port: number;
  start: string | null;
  monitor: "up" | "down" | "unknown";
  analytics?: boolean;
  status?: boolean;
  commits: string[];
};

const PROJECTS: ProjectSeed[] = [
  {
    id: "demo-recipe-api",
    slug: "recipe-api",
    name: "recipe-api",
    repo: "sam-r/recipe-api",
    runtime: "node",
    port: 3000,
    start: "node dist/server.js",
    monitor: "up",
    status: true,
    commits: [
      "Add pagination to /recipes",
      "Cache ingredient lookups for 5 minutes",
      "fix: 500 when a recipe has no steps",
      "Bump zod to 3.25",
      "Rate limit the search endpoint",
      "wip: tags",
    ],
  },
  {
    id: "demo-hackatime-stats",
    slug: "hackatime-stats",
    name: "hackatime-stats",
    repo: "sam-r/hackatime-stats",
    runtime: "node",
    port: 3001,
    start: null,
    monitor: "up",
    analytics: true,
    status: true,
    commits: [
      "Fix timezone offset in weekly summary",
      "Show streaks on the profile page",
      "Lazy-load the language chart",
      "Dark mode for the leaderboard",
      "Handle users with no heartbeats yet",
    ],
  },
  {
    id: "demo-pixel-garden",
    slug: "pixel-garden",
    name: "pixel-garden",
    repo: "sam-r/pixel-garden",
    runtime: "static",
    port: 5173,
    start: null,
    monitor: "up",
    commits: [
      "Switch canvas renderer to OffscreenCanvas",
      "Seed packets are draggable now",
      "Fix flicker on Safari",
      "Water animation",
    ],
  },
  {
    id: "demo-standup-bot",
    slug: "standup-bot",
    name: "standup-bot",
    repo: "sam-r/standup-bot",
    runtime: "python",
    port: 8081,
    start: "python3 bot.py",
    monitor: "down",
    commits: [
      "Skip reminders on public holidays",
      "Post the summary as a thread",
      "Read the Slack token from SLACK_TOKEN",
    ],
  },
];

const BUILD_LOG = (p: ProjectSeed, commit: string, failed: boolean) => {
  const lines: [string, string][] = [
    ["info", `Cloning ${p.repo} at ${commit.slice(0, 7)}`],
    ["info", p.runtime === "python" ? "Found requirements.txt" : "Found pnpm-lock.yaml, using pnpm"],
    ["info", p.runtime === "python" ? "No build step" : "Running pnpm install --frozen-lockfile"],
    ["info", p.runtime === "python" ? "Packing release" : "Packages: +214"],
  ];
  if (p.runtime !== "python") lines.push(["info", "Running pnpm build"], ["info", "Build finished in 18.4s"]);
  lines.push(["info", "Connecting to your Nest container"], ["info", "Uploading 4.2 MB"], ["info", `Starting ${p.slug} on port ${p.port}`]);
  if (failed) {
    lines.push(
      ["info", `Waiting for the app to answer on port ${p.port}`],
      ["error", "The app did not answer within 60 seconds"],
      ["warn", "Last log lines from the service:"],
      ["warn", "Error: Cannot find module './renderer/offscreen.js'"],
      ["warn", "Reverting to the previous release"],
    );
  } else {
    lines.push(["info", `Waiting for the app to answer on port ${p.port}`], ["info", "Answered with HTTP 200 in 340 ms"], ["info", "Live"]);
  }
  return lines;
};

async function seed() {
  const db = await getDb();
  const user = await upsertUser({ id: "dev:dev", name: "dev", email: null, slackId: null });
  await reset();
  const now = Date.now();

  // ------------------------------------------------------------ server
  const key = generateServerKey("nest-deploy:sam-r (demo)");
  await db.insert(schema.servers).values({
    id: SERVER_ID,
    userId: user.id,
    nestUsername: "sam-r",
    host: "127.0.0.1",
    port: 1,
    publicKey: key.publicKey,
    privateKeyEnc: seal(key.privateKey, `server:${SERVER_ID}`),
    keyFingerprint: key.fingerprint,
    status: "connected",
    probe: JSON.stringify({
      uid: 0,
      os: "Debian GNU/Linux 12 (bookworm)",
      arch: "x86_64",
      home: "/home/sam-r",
      systemdState: "running",
      has: { systemctl: true, node: true, npm: true, python3: true, tar: true, curl: true, git: true, sha256sum: true },
      nodeVersion: "v22.11.0",
      pythonVersion: "Python 3.11.2",
      cpus: 2,
      memTotalMb: 2048,
      memUsedMb: 1187,
      diskTotalMb: 16384,
      diskUsedMb: 9420,
      load1: 0.42,
    }),
    lastCheckedAt: new Date(now - 4 * MIN),
    createdAt: new Date(now - 21 * DAY),
  });

  // ------------------------------------------------------------ projects and deployments
  let depN = 0;
  for (const [pi, p] of PROJECTS.entries()) {
    await db.insert(schema.projects).values({
      id: p.id,
      userId: user.id,
      serverId: SERVER_ID,
      slug: p.slug,
      name: p.name,
      repoFullName: p.repo,
      repoUrl: `https://github.com/${p.repo}.git`,
      productionBranch: "main",
      runtime: p.runtime,
      startCommand: p.start,
      outputDir: p.runtime === "static" ? "dist" : null,
      port: p.port,
      healthPath: p.runtime === "python" ? "/healthz" : "/",
      autoDeploy: true,
      monitorState: p.monitor,
      monitorSince: new Date(now - (p.monitor === "down" ? 47 * MIN : 3 * DAY)),
      analyticsKey: p.analytics ? `nda_demo${pi}` : null,
      statusKey: p.status ? `demostatus${pi}x` : null,
      createdAt: new Date(now - (20 - pi) * DAY),
      updatedAt: new Date(now - DAY),
    });

    // Newest first: a preview or two, then production history.
    const history: {
      env: "production" | "preview";
      branch: string;
      state: "ready" | "error" | "building" | "canceled";
      ago: number;
      took: number;
      pr?: number;
    }[] = [];
    if (pi === 0) history.push({ env: "preview", branch: "feat/pagination", state: "building", ago: 1 * MIN, took: 0, pr: 14 });
    if (pi === 1) history.push({ env: "preview", branch: "streaks", state: "ready", ago: 3 * 60 * MIN, took: 51_000, pr: 9 });
    if (pi === 2) history.push({ env: "production", branch: "main", state: "error", ago: 26 * 60 * MIN, took: 31_000 });
    p.commits.forEach((_, ci) => {
      const ago = (ci + 1) * (pi + 2) * 9 * 60 * MIN + pi * 40 * MIN;
      history.push({
        env: ci === 2 && pi !== 3 ? "preview" : "production",
        branch: ci === 2 && pi !== 3 ? pick(["fix/steps", "dark-mode", "safari-flicker"]) : "main",
        state: ci === 3 && pi === 0 ? "canceled" : "ready",
        ago,
        took: 22_000 + Math.floor(rand() * 40_000),
      });
    });

    let currentMarked = false;
    let previewPort = 20000 + pi * 3;
    for (const [hi, d] of history.entries()) {
      const id = `demo-dep-${++depN}`;
      const commitSha = sha();
      const createdAt = new Date(now - d.ago);
      const isCurrent = d.env === "production" && d.state === "ready" && !currentMarked;
      if (isCurrent) currentMarked = true;
      await db.insert(schema.deployments).values({
        id,
        projectId: p.id,
        triggeredBy: d.state === "canceled" ? user.id : null,
        env: d.env,
        state: d.state,
        source: hi === history.length - 1 ? "manual" : "webhook",
        branch: d.branch,
        commitSha,
        commitMessage: p.commits[Math.min(hi, p.commits.length - 1)],
        prNumber: d.pr ?? null,
        author: "sam-r",
        port: d.env === "production" ? p.port : previewPort++,
        releaseId: randomUUID(),
        isCurrent,
        cleanedUp: d.env === "preview" && hi > 2,
        archiveBytes: 4_200_000 + Math.floor(rand() * 900_000),
        error: d.state === "error" ? "The app did not answer on its port. The previous release was put back." : d.state === "canceled" ? "Canceled" : null,
        createdAt,
        startedAt: new Date(createdAt.getTime() + 2_000),
        finishedAt: d.state === "building" ? null : new Date(createdAt.getTime() + 2_000 + d.took),
      });
      if (hi < 3) {
        const lines = d.state === "building" ? BUILD_LOG(p, commitSha, false).slice(0, 4) : BUILD_LOG(p, commitSha, d.state === "error");
        await db.insert(schema.deploymentLogs).values(
          lines.map(([level, message], li) => ({
            deploymentId: id,
            at: new Date(createdAt.getTime() + 2_000 + li * 1_700),
            level: level as "info" | "warn" | "error",
            message,
          })),
        );
      }
    }

    // Environment variables (values are sealed like real ones).
    const vars: [string, string, "all" | "production" | "preview"][] =
      p.runtime === "python"
        ? [["SLACK_TOKEN", "xoxb-demo", "all"], ["CHANNEL", "#standup", "production"]]
        : [["DATABASE_URL", "postgres://demo", "production"], ["API_KEY", "demo-key", "all"], ["LOG_LEVEL", "debug", "preview"]];
    for (const [k, v, target] of vars) {
      await db.insert(schema.envVars).values({
        id: `demo-env-${p.slug}-${k}-${target}`,
        projectId: p.id,
        key: k,
        valueEnc: seal(v, `env:${p.id}:${k}:${target}`),
        target,
        createdAt: new Date(now - 10 * DAY),
      });
    }

    // Resource samples every 5 minutes for the last 24 hours.
    if (p.monitor !== "unknown") {
      const base = [92, 148, 18, 61][pi];
      const rows = [];
      for (let t = now - DAY; t <= now; t += 5 * MIN) {
        const wave = Math.sin((t / DAY) * Math.PI * 2 + pi) * 0.25 + 1;
        const down = p.monitor === "down" && t > now - 47 * MIN;
        rows.push({
          projectId: p.id,
          at: new Date(t),
          memMb: down ? null : Math.round(base * wave + rand() * 8),
          cpuPercent: down ? null : Math.round((2 + rand() * (pi === 1 ? 14 : 5)) * wave * 10) / 10,
          cpuNs: null,
          restarts: p.monitor === "down" ? 6 : 0,
        });
      }
      await db.insert(schema.projectSamples).values(rows);
    }
  }

  // ------------------------------------------------------------ server usage history
  {
    const rows = [];
    for (let t = now - DAY; t <= now; t += 5 * MIN) {
      const wave = Math.sin((t / DAY) * Math.PI * 2) * 0.3 + 1;
      rows.push({
        serverId: SERVER_ID,
        at: new Date(t),
        cpuLoad: Math.round((0.25 + rand() * 0.5) * wave * 100) / 100,
        cpus: 2,
        memUsedMb: Math.round(1050 + 160 * wave + rand() * 60),
        memTotalMb: 2048,
        diskUsedMb: Math.round(9300 + ((t - (now - DAY)) / DAY) * 120),
        diskTotalMb: 16384,
      });
    }
    await db.insert(schema.usageSamples).values(rows);
  }

  // ------------------------------------------------------------ domains
  await db.insert(schema.domains).values([
    {
      id: "demo-domain-1",
      userId: user.id,
      serverId: SERVER_ID,
      projectId: "demo-recipe-api",
      domain: "recipes.sam-r.dev",
      port: 3000,
      status: "valid",
      lastCheckedAt: new Date(now - 2 * 60 * MIN),
      createdAt: new Date(now - 12 * DAY),
    },
    {
      id: "demo-domain-2",
      userId: user.id,
      serverId: SERVER_ID,
      projectId: "demo-hackatime-stats",
      domain: "stats.sam-r.hackclub.app",
      port: 3001,
      status: "valid",
      lastCheckedAt: new Date(now - 30 * MIN),
      createdAt: new Date(now - 9 * DAY),
    },
    {
      id: "demo-domain-3",
      userId: user.id,
      serverId: SERVER_ID,
      projectId: "demo-pixel-garden",
      domain: "garden.example.com",
      port: 5173,
      status: "invalid",
      lastCheckedAt: new Date(now - 5 * MIN),
      createdAt: new Date(now - 1 * DAY),
    },
  ]);

  // ------------------------------------------------------------ analytics page views
  {
    const pages = ["/", "/", "/", "/leaderboard", "/leaderboard", "/u/sam-r", "/u/orpheus", "/languages", "/about"];
    const refs = [null, null, null, "https://hackclub.slack.com/", "https://github.com/sam-r/hackatime-stats", "https://news.ycombinator.com/", "https://www.google.com/"];
    const rows = [];
    for (let day = 29; day >= 0; day--) {
      const weekend = new Date(now - day * DAY).getUTCDay() % 6 === 0;
      const count = Math.round((weekend ? 30 : 60) + rand() * 70 + (29 - day) * 2);
      const visitors = Math.max(4, Math.round(count / 2.4));
      for (let i = 0; i < count; i++) {
        rows.push({
          projectId: "demo-hackatime-stats",
          at: new Date(now - day * DAY - Math.floor(rand() * DAY * 0.9)),
          path: pick(pages),
          referrer: pick(refs)?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? null,
          visitor: sha256Hex(`demo|${day}|${Math.floor(rand() * visitors)}`).slice(0, 16),
        });
      }
    }
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.pageviews).values(rows.slice(i, i + 500));
  }

  // ------------------------------------------------------------ activity and outages
  const act = (action: string, target: string, agoMin: number, meta?: Record<string, string>) => ({
    userId: user.id,
    action,
    target,
    meta: meta ? JSON.stringify(meta) : null,
    at: new Date(now - agoMin * MIN),
  });
  await db.insert(schema.auditLog).values([
    act("monitor.down", "demo-standup-bot", 47, { detail: "The service is failed." }),
    act("project.restart", "demo-recipe-api", 3 * 60),
    act("env.set", "demo-recipe-api", 5 * 60, { name: "API_KEY", target: "all" }),
    act("deploy.rollback", "demo-pixel-garden", 25 * 60, { sha: "9d02a7e" }),
    act("domain.add", "demo-pixel-garden", 26 * 60, { domain: "garden.example.com" }),
    act("monitor.up", "demo-hackatime-stats", 3 * 24 * 60, { detail: "It is answering again." }),
    act("monitor.down", "demo-hackatime-stats", 3 * 24 * 60 + 22, { detail: "The health path answered HTTP 502." }),
    act("analytics.enable", "demo-hackatime-stats", 9 * 24 * 60),
    act("status.enable", "demo-hackatime-stats", 9 * 24 * 60 + 5),
    act("monitor.up", "demo-recipe-api", 6 * 24 * 60, { detail: "It is answering again." }),
    act("monitor.down", "demo-recipe-api", 6 * 24 * 60 + 9, { detail: "Nothing answered on the health path." }),
    act("project.create", "demo-standup-bot", 17 * 24 * 60, { name: "standup-bot" }),
  ]);
}

const wantReset = process.argv.includes("--reset");
(wantReset ? reset().then((n) => console.log(`Removed the sample data (${n} projects).`)) : seed().then(() => {
  console.log("Sample data added for the dev user. Sign in with the Development sign-in form, name: dev");
  console.log("Status pages: /status/demostatus0x (recipe-api) and /status/demostatus1x (hackatime-stats)");
  console.log("Remove it again with: pnpm seed:demo --reset");
}))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
