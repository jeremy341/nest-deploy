// Sample data for the first UI pass.
// Nothing here comes from a real Nest server or GitHub account.

export type DeployState = "ready" | "building" | "error" | "queued";

export type Project = {
  slug: string;
  name: string;
  repo: string;
  branch: string;
  domain: string;
  port: number;
  runtime: string;
  start: string;
  state: DeployState;
  commit: string;
  sha: string;
  author: string;
  age: string;
};

export type Deployment = {
  id: string;
  projectSlug: string;
  env: "Production" | "Preview";
  state: DeployState;
  commit: string;
  branch: string;
  author: string;
  age: string;
  duration: string;
};

export type LogLevel = "info" | "warn" | "error";

export type LogLine = {
  time: string;
  level: LogLevel;
  source: string;
  message: string;
};

export type Domain = {
  domain: string;
  port: number;
  status: "valid" | "pending";
};

export const server = {
  username: "sam-r",
  host: "sam-r.hackclub.app",
};

export const usage = [
  { label: "CPU", used: 0.4, total: 2, unit: "vCPU" },
  { label: "Memory", used: 1.1, total: 2, unit: "GB" },
  { label: "Disk", used: 6.8, total: 16, unit: "GB" },
];

export const projects: Project[] = [
  {
    slug: "hackatime-stats",
    name: "hackatime-stats",
    repo: "sam-r/hackatime-stats",
    branch: "main",
    domain: "hackatime-stats.sam-r.hackclub.app",
    port: 3000,
    runtime: "Node.js 22",
    start: "node server.js",
    state: "ready",
    commit: "Fix timezone offset in weekly summary",
    sha: "7c2f9ab",
    author: "sam-r",
    age: "2h ago",
  },
  {
    slug: "standup-bot",
    name: "standup-bot",
    repo: "sam-r/standup-bot",
    branch: "main",
    domain: "standup-bot.sam-r.hackclub.app",
    port: 8081,
    runtime: "Python 3.12",
    start: "python bot.py",
    state: "ready",
    commit: "Skip reminders on public holidays",
    sha: "b41d0e7",
    author: "sam-r",
    age: "1d ago",
  },
  {
    slug: "recipe-api",
    name: "recipe-api",
    repo: "sam-r/recipe-api",
    branch: "feat/pagination",
    domain: "recipe-api.sam-r.hackclub.app",
    port: 4000,
    runtime: "Node.js 22",
    start: "node dist/index.js",
    state: "building",
    commit: "Add pagination to /recipes",
    sha: "e90a1c3",
    author: "sam-r",
    age: "1m ago",
  },
  {
    slug: "portfolio-site",
    name: "portfolio-site",
    repo: "sam-r/portfolio-site",
    branch: "main",
    domain: "portfolio-site.sam-r.hackclub.app",
    port: 8080,
    runtime: "Static",
    start: "caddy file-server",
    state: "ready",
    commit: "Replace hero photo and tighten copy",
    sha: "3d7e552",
    author: "sam-r",
    age: "3d ago",
  },
  {
    slug: "pixel-garden",
    name: "pixel-garden",
    repo: "sam-r/pixel-garden",
    branch: "main",
    domain: "pixel-garden.sam-r.hackclub.app",
    port: 5173,
    runtime: "Node.js 22",
    start: "node server/index.js",
    state: "error",
    commit: "Switch canvas renderer to OffscreenCanvas",
    sha: "a08c6f1",
    author: "sam-r",
    age: "1d ago",
  },
  {
    slug: "club-wall",
    name: "club-wall",
    repo: "sam-r/club-wall",
    branch: "main",
    domain: "club-wall.sam-r.hackclub.app",
    port: 3001,
    runtime: "Node.js 22",
    start: "node server.js",
    state: "ready",
    commit: "Bump dependencies",
    sha: "5f1b83d",
    author: "sam-r",
    age: "6d ago",
  },
];

export const deployments: Deployment[] = [
  {
    id: "e90a1c3",
    projectSlug: "recipe-api",
    env: "Preview",
    state: "building",
    commit: "Add pagination to /recipes",
    branch: "feat/pagination",
    author: "sam-r",
    age: "1m ago",
    duration: "In progress",
  },
  {
    id: "7c2f9ab",
    projectSlug: "hackatime-stats",
    env: "Production",
    state: "ready",
    commit: "Fix timezone offset in weekly summary",
    branch: "main",
    author: "sam-r",
    age: "2h ago",
    duration: "48s",
  },
  {
    id: "a08c6f1",
    projectSlug: "pixel-garden",
    env: "Production",
    state: "error",
    commit: "Switch canvas renderer to OffscreenCanvas",
    branch: "main",
    author: "sam-r",
    age: "1d ago",
    duration: "31s",
  },
  {
    id: "b41d0e7",
    projectSlug: "standup-bot",
    env: "Production",
    state: "ready",
    commit: "Skip reminders on public holidays",
    branch: "main",
    author: "sam-r",
    age: "1d ago",
    duration: "22s",
  },
  {
    id: "3d7e552",
    projectSlug: "portfolio-site",
    env: "Production",
    state: "ready",
    commit: "Replace hero photo and tighten copy",
    branch: "main",
    author: "sam-r",
    age: "3d ago",
    duration: "14s",
  },
  {
    id: "9ae44d0",
    projectSlug: "hackatime-stats",
    env: "Production",
    state: "ready",
    commit: "Cache the leaderboard query for 60 seconds",
    branch: "main",
    author: "sam-r",
    age: "4d ago",
    duration: "51s",
  },
  {
    id: "5f1b83d",
    projectSlug: "club-wall",
    env: "Production",
    state: "ready",
    commit: "Bump dependencies",
    branch: "main",
    author: "sam-r",
    age: "6d ago",
    duration: "39s",
  },
  {
    id: "c6d02e8",
    projectSlug: "hackatime-stats",
    env: "Production",
    state: "ready",
    commit: "Move cron job to a systemd timer",
    branch: "main",
    author: "sam-r",
    age: "8d ago",
    duration: "44s",
  },
];

export const logs: LogLine[] = [
  { time: "14:02:11", level: "info", source: "recipe-api", message: "Cloning sam-r/recipe-api at e90a1c3" },
  { time: "14:02:13", level: "info", source: "recipe-api", message: "Running pnpm install --frozen-lockfile" },
  { time: "14:02:29", level: "warn", source: "recipe-api", message: "Peer dependency mismatch: zod@3 expected, found zod@4" },
  { time: "14:02:41", level: "info", source: "recipe-api", message: "Build command: pnpm build" },
  { time: "13:58:07", level: "error", source: "pixel-garden", message: "ReferenceError: OffscreenCanvas is not defined" },
  { time: "13:58:07", level: "error", source: "pixel-garden", message: "Health check on port 5173 failed after 30s, keeping previous release" },
  { time: "12:30:44", level: "info", source: "hackatime-stats", message: "Listening on port 3000" },
  { time: "12:30:44", level: "info", source: "hackatime-stats", message: "Release 7c2f9ab is now serving traffic" },
  { time: "11:15:02", level: "warn", source: "system", message: "Disk usage above 40 percent of the 16 GB quota" },
  { time: "09:00:00", level: "info", source: "standup-bot", message: "Posted daily standup prompt to #team-updates" },
];

export const domains: Domain[] = [
  { domain: "hackatime-stats.sam-r.hackclub.app", port: 3000, status: "valid" },
  { domain: "standup-bot.sam-r.hackclub.app", port: 8081, status: "valid" },
  { domain: "stats.samr.dev", port: 3000, status: "pending" },
];

export function getProject(slug: string) {
  return projects.find((p) => p.slug === slug);
}

export function deploymentsFor(slug: string) {
  return deployments.filter((d) => d.projectSlug === slug);
}

export function projectName(slug: string) {
  return getProject(slug)?.name ?? slug;
}

export function getDeployment(slug: string, id: string) {
  return deployments.find((d) => d.projectSlug === slug && d.id === id);
}

/** The newest ready Production deployment of a project is the live one. */
export function isCurrentProduction(d: Deployment) {
  if (d.env !== "Production" || d.state !== "ready") return false;
  const live = deploymentsFor(d.projectSlug).find(
    (x) => x.env === "Production" && x.state === "ready"
  );
  return live?.id === d.id;
}

export type BuildLine = { time: string; text: string; tone?: "warn" | "error" };

/** Sample build output for a deployment. Not real output. */
export function buildLogFor(d: Deployment): BuildLine[] {
  const base: BuildLine[] = [
    { time: "14:02:11.204", text: `Cloning github.com/${getProject(d.projectSlug)?.repo ?? "owner/repo"} (Branch: ${d.branch}, Commit: ${d.id})` },
    { time: "14:02:12.870", text: "Cloning completed: 1.2s" },
    { time: "14:02:13.011", text: "Restored build cache from previous deployment" },
    { time: "14:02:13.402", text: "Running install command: pnpm install --frozen-lockfile" },
    { time: "14:02:14.118", text: "Lockfile is up to date, resolution step is skipped" },
    { time: "14:02:19.640", text: "Packages: +312" },
    { time: "14:02:27.002", text: "Done in 13.6s" },
    { time: "14:02:27.350", text: "Running build command: pnpm build" },
  ];
  if (d.state === "error") {
    return [
      ...base,
      { time: "14:02:31.771", text: "ReferenceError: OffscreenCanvas is not defined", tone: "error" },
      { time: "14:02:31.772", text: "Health check on the new release failed after 30s", tone: "error" },
      { time: "14:02:31.790", text: "Keeping the previous release live", tone: "warn" },
    ];
  }
  if (d.state === "building") {
    return [...base, { time: "14:02:41.007", text: "Compiling..." }];
  }
  return [
    ...base,
    { time: "14:02:29.115", text: "Peer dependency mismatch: zod@3 expected, found zod@4", tone: "warn" },
    { time: "14:02:41.007", text: "Compiled successfully" },
    { time: "14:02:41.480", text: "Creating release directory and switching the current symlink" },
    { time: "14:02:42.003", text: "Restarting service and waiting for the health check" },
    { time: "14:02:44.512", text: "Health check passed on port " + (getProject(d.projectSlug)?.port ?? 3000) },
    { time: "14:02:44.620", text: "Deployment completed" },
  ];
}
