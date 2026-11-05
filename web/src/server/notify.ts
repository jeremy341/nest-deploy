import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/server/config";
import { newId, open, seal } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import type { AlertType } from "@/server/db/schema";
import { HttpError } from "@/server/http";
import { getProjectForUser } from "@/server/projects";
import { durationText } from "@/lib/status";

/**
 * Deployment notifications for Discord and Slack incoming webhooks.
 *
 * The URL is a secret and the server posts to it, so it is locked down:
 * https only, a fixed list of hosts, and the path shape those services use.
 * That keeps it from being used to make our server call internal addresses.
 * Redirects are refused, and the stored URL is sealed.
 */

type Kind = "discord" | "slack";

const HOSTS: Record<Kind, RegExp> = {
  discord: /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/,
  slack: /^hooks\.slack\.com$/,
};
const PATHS: Record<Kind, RegExp> = {
  discord: /^\/api\/webhooks\/\d+\/[\w-]+\/?$/,
  slack: /^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+\/?$/,
};

export function parseNotifyUrl(raw: string): { url: string; kind: Kind } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "That is not a valid URL.", "validation");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) {
    throw new HttpError(400, "Use the plain https webhook URL from Discord or Slack.", "validation");
  }
  for (const kind of ["discord", "slack"] as const) {
    if (HOSTS[kind].test(u.hostname) && PATHS[kind].test(u.pathname)) {
      return { url: u.toString(), kind };
    }
  }
  throw new HttpError(
    400,
    "Only Discord and Slack incoming webhook URLs are supported.",
    "validation"
  );
}

export const notifyInput = z.object({
  url: z.string().trim().min(1).max(500),
  on: z.enum(["all", "failures"]).default("all"),
});

const context = (projectId: string) => `notify:${projectId}`;

export async function setNotifications(userId: string, projectId: string, raw: unknown) {
  const input = notifyInput.parse(raw);
  const project = await getProjectForUser(userId, projectId);
  const { url } = parseNotifyUrl(input.url);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ notifyUrlEnc: seal(url, context(project.id)), notifyOn: input.on, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  return notifySummary({ ...project, notifyUrlEnc: "set", notifyOn: input.on }, url);
}

export async function clearNotifications(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ notifyUrlEnc: null, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
}

/** What the UI may show: the service and an "on" setting, never the URL. */
export function notifySummary(
  project: { notifyUrlEnc: string | null; notifyOn: "all" | "failures"; id: string },
  knownUrl?: string
) {
  if (!project.notifyUrlEnc) return null;
  try {
    const url = knownUrl ?? open(project.notifyUrlEnc, context(project.id));
    return { kind: parseNotifyUrl(url).kind, on: project.notifyOn };
  } catch {
    // An unreadable value must not take the settings page down.
    return null;
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type Message = { title: string; detail: string; link: string };

function payload(kind: Kind, m: Message) {
  const text = `${m.title}\n${m.detail}\n${m.link}`;
  return kind === "discord"
    ? { username: "Nest Deploy", content: text, allowed_mentions: { parse: [] } }
    : { text };
}

async function post(url: string, kind: Kind, m: Message, fetcher: Fetcher) {
  const res = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload(kind, m)),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new HttpError(502, `${kind === "discord" ? "Discord" : "Slack"} answered ${res.status}.`, "notify_failed");
}

const appLink = (path: string) => `${config().APP_URL.replace(/\/$/, "")}${path}`;

/** Send a test message so people can confirm the URL works before relying on it. */
export async function sendTestNotification(
  userId: string,
  projectId: string,
  fetcher: Fetcher = fetch
) {
  const project = await getProjectForUser(userId, projectId);
  if (!project.notifyUrlEnc) throw new HttpError(400, "Add a webhook URL first.", "validation");
  const { url, kind } = parseNotifyUrl(open(project.notifyUrlEnc, context(project.id)));
  await post(
    url,
    kind,
    {
      title: `Test from Nest Deploy for ${project.name}`,
      detail: "If you can read this, deployment messages will arrive here.",
      link: appLink(`/projects/${project.slug}`),
    },
    fetcher
  );
}

/**
 * Called when a deployment reaches a final state. Never throws: a broken
 * webhook must not affect a deployment.
 */
export async function notifyDeploymentFinished(deploymentId: string, fetcher: Fetcher = fetch) {
  try {
    const db = await getDb();
    const dep = await db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.id, deploymentId))
      .get();
    if (!dep || (dep.state !== "ready" && dep.state !== "error")) return;
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, dep.projectId))
      .get();
    if (!project?.notifyUrlEnc) return;
    if (project.notifyOn === "failures" && dep.state === "ready") return;
    if (!project.alertOnDeploy) return;

    const { url, kind } = parseNotifyUrl(open(project.notifyUrlEnc, context(project.id)));
    const where = dep.env === "production" ? "production" : "a preview";
    const what = dep.commitMessage ? `"${dep.commitMessage.slice(0, 120)}"` : `${dep.source} deployment`;
    const sha = dep.commitSha ? ` ${dep.commitSha.slice(0, 7)}` : "";
    const took = durationText(dep.startedAt, dep.finishedAt);
    const message = {
      title:
        dep.state === "ready"
          ? `${project.name} is live in ${where}`
          : `${project.name} failed to deploy to ${where}`,
      detail:
        dep.state === "ready"
          ? `${dep.branch}${sha}: ${what} (${took})`
          : `${dep.branch}${sha}: ${(dep.error ?? "The deployment failed.").slice(0, 200)}`,
      link: appLink(`/projects/${project.slug}/deployments/${dep.id}`),
    };
    const now = new Date();
    const muted = isMuted(project, now);
    await db.insert(schema.alertEvents).values({
      id: newId(),
      projectId: project.id,
      type: "deploy",
      message: `${message.title}. ${message.detail}`.slice(0, 400),
      firedAt: now,
      muted,
    });
    if (muted) return;
    await post(url, kind, message, fetcher);
  } catch (err) {
    console.warn("notification failed", err instanceof Error ? err.message : err);
  }
}

/**
 * Tell the project's webhook that the live app stopped answering, or came back.
 * Never throws: a broken webhook must not stop the monitor.
 */
export async function notifyProjectStatus(
  project: { id: string; slug: string; name: string; notifyUrlEnc: string | null },
  change: "down" | "up",
  detail: string,
  fetcher: Fetcher = fetch
) {
  try {
    if (!project.notifyUrlEnc) return;
    const { url, kind } = parseNotifyUrl(open(project.notifyUrlEnc, context(project.id)));
    await post(
      url,
      kind,
      {
        title: change === "down" ? `${project.name} is not answering` : `${project.name} is back up`,
        detail,
        link: appLink(`/projects/${project.slug}`),
      },
      fetcher
    );
  } catch (err) {
    console.warn("status notification failed", err instanceof Error ? err.message : err);
  }
}

// ------------------------------------------------------------ alert settings

export type AlertKind = AlertType;

/** How long alert history is kept. */
export const ALERT_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

const DEFAULT_LIMIT_PCT = 90;

const percent = (label: string) =>
  z
    .number({ error: `${label} must be a whole number from 1 to 100.` })
    .int(`${label} must be a whole number.`)
    .min(1, `${label} must be at least 1.`)
    .max(100, `${label} cannot be above 100.`);

/** Only the fields that are sent change, so each control can save on its own. */
export const alertSettingsInput = z
  .object({
    diskPct: percent("The disk limit"),
    memoryPct: percent("The memory limit"),
    cpuPct: percent("The CPU limit"),
    failuresBeforeDown: z
      .number({ error: "Failed checks must be a whole number from 1 to 10." })
      .int("Failed checks must be a whole number.")
      .min(1, "Failed checks must be at least 1.")
      .max(10, "Failed checks cannot be above 10."),
    /** Null turns the response time limit off. */
    slowMs: z
      .number({ error: "The response time limit must be a whole number of milliseconds." })
      .int("The response time limit must be a whole number of milliseconds.")
      .min(50, "The response time limit must be at least 50 ms.")
      .max(60_000, "The response time limit cannot be above 60000 ms.")
      .nullable(),
    channels: z
      .object({
        down: z.boolean(),
        recovery: z.boolean(),
        resource: z.boolean(),
        deploy: z.boolean(),
      })
      .partial(),
  })
  .partial();

export const muteInput = z.object({
  duration: z.enum(["1h", "24h", "until_resumed"]),
});

type MuteFields = {
  alertMutedUntil: Date | null;
  alertMutedForever: boolean;
};

/** Pure: whether alerts are paused at this moment. Events are still recorded. */
export function isMuted(p: MuteFields, now = new Date()): boolean {
  return p.alertMutedForever || (p.alertMutedUntil !== null && p.alertMutedUntil.getTime() > now.getTime());
}

/** Pure: the mute columns to store for a chosen duration. */
export function muteFields(
  duration: z.infer<typeof muteInput>["duration"],
  now = new Date()
): MuteFields {
  if (duration === "until_resumed") return { alertMutedUntil: null, alertMutedForever: true };
  const hours = duration === "1h" ? 1 : 24;
  return { alertMutedUntil: new Date(now.getTime() + hours * 3_600_000), alertMutedForever: false };
}

type ProjectRow = typeof schema.projects.$inferSelect;

export type AlertSettings = {
  diskPct: number;
  memoryPct: number;
  cpuPct: number;
  failuresBeforeDown: number;
  slowMs: number | null;
  channels: { down: boolean; recovery: boolean; resource: boolean; deploy: boolean };
  mute: { active: boolean; forever: boolean; until: string | null };
};

export type AlertEventView = {
  id: string;
  type: AlertKind;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  muted: boolean;
};

export function alertSettingsView(p: ProjectRow, now = new Date()): AlertSettings {
  const active = isMuted(p, now);
  return {
    diskPct: p.alertDiskPct,
    memoryPct: p.alertMemPct,
    cpuPct: p.alertCpuPct,
    failuresBeforeDown: p.alertFailures,
    slowMs: p.alertSlowMs,
    channels: {
      down: p.alertOnDown,
      recovery: p.alertOnRecovery,
      resource: p.alertOnResource,
      deploy: p.alertOnDeploy,
    },
    mute: {
      active,
      forever: p.alertMutedForever,
      until: !p.alertMutedForever && active && p.alertMutedUntil ? p.alertMutedUntil.toISOString() : null,
    },
  };
}

export async function listAlertEvents(
  userId: string,
  projectId: string,
  limit = 50
): Promise<AlertEventView[]> {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.alertEvents)
    .where(eq(schema.alertEvents.projectId, project.id))
    .orderBy(desc(schema.alertEvents.firedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    firedAt: r.firedAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    muted: r.muted,
  }));
}

export async function getAlerts(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  return {
    settings: alertSettingsView(project),
    history: await listAlertEvents(userId, projectId),
  };
}

export async function setAlertSettings(userId: string, projectId: string, raw: unknown) {
  const input = alertSettingsInput.parse(raw);
  const project = await getProjectForUser(userId, projectId);
  const c = input.channels ?? {};
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({
      ...(input.diskPct !== undefined ? { alertDiskPct: input.diskPct } : {}),
      ...(input.memoryPct !== undefined ? { alertMemPct: input.memoryPct } : {}),
      ...(input.cpuPct !== undefined ? { alertCpuPct: input.cpuPct } : {}),
      ...(input.failuresBeforeDown !== undefined ? { alertFailures: input.failuresBeforeDown } : {}),
      ...(input.slowMs !== undefined ? { alertSlowMs: input.slowMs } : {}),
      ...(c.down !== undefined ? { alertOnDown: c.down } : {}),
      ...(c.recovery !== undefined ? { alertOnRecovery: c.recovery } : {}),
      ...(c.resource !== undefined ? { alertOnResource: c.resource } : {}),
      ...(c.deploy !== undefined ? { alertOnDeploy: c.deploy } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.id, project.id));
  return (await getAlerts(userId, projectId)).settings;
}

export async function setMute(
  userId: string,
  projectId: string,
  raw: unknown,
  now = new Date()
) {
  const input = muteInput.parse(raw);
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ ...muteFields(input.duration, now), updatedAt: now })
    .where(eq(schema.projects.id, project.id));
  return (await getAlerts(userId, projectId)).settings;
}

export async function clearMute(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ alertMutedUntil: null, alertMutedForever: false, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  return (await getAlerts(userId, projectId)).settings;
}

/** What the Projects page needs: the lowest limits in use and which projects are paused. */
export async function alertOverview(userId: string, now = new Date()) {
  const db = await getDb();
  const rows = await db.select().from(schema.projects).where(eq(schema.projects.userId, userId));
  const min = (pick: (p: ProjectRow) => number) =>
    rows.length ? Math.min(...rows.map(pick)) : DEFAULT_LIMIT_PCT;
  return {
    limits: {
      diskPct: min((p) => p.alertDiskPct),
      memoryPct: min((p) => p.alertMemPct),
      cpuPct: min((p) => p.alertCpuPct),
    },
    muted: rows
      .filter((p) => isMuted(p, now))
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        until: p.alertMutedForever || !p.alertMutedUntil ? null : p.alertMutedUntil.toISOString(),
      })),
  };
}

/** Drop history older than 90 days. Alerts that are still open are kept. */
export async function pruneAlertEvents(now = new Date()) {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - ALERT_KEEP_MS);
  await db
    .delete(schema.alertEvents)
    .where(
      or(
        lt(schema.alertEvents.resolvedAt, cutoff),
        and(
          isNull(schema.alertEvents.resolvedAt),
          eq(schema.alertEvents.type, "deploy"),
          lt(schema.alertEvents.firedAt, cutoff)
        )
      )
    );
}

// ------------------------------------------------------------ firing alerts

type AlertProject = Pick<
  ProjectRow,
  | "id"
  | "slug"
  | "name"
  | "notifyUrlEnc"
  | "alertOnDown"
  | "alertOnRecovery"
  | "alertOnResource"
  | "alertMutedUntil"
  | "alertMutedForever"
>;

const RESOURCE_TITLE: Record<"disk" | "memory" | "cpu", [string, string]> = {
  disk: ["disk usage is high", "disk usage is back to normal"],
  memory: ["memory usage is high", "memory usage is back to normal"],
  cpu: ["CPU load is high", "CPU load is back to normal"],
};

function titleFor(
  project: AlertProject,
  type: Exclude<AlertKind, "deploy">,
  phase: "fire" | "resolve"
): string {
  if (type === "down") {
    return phase === "fire" ? `${project.name} is not answering` : `${project.name} is back up`;
  }
  return `${project.name}: ${RESOURCE_TITLE[type][phase === "fire" ? 0 : 1]}`;
}

/** Send to the webhook if there is one. Never throws. */
async function deliver(
  project: AlertProject,
  type: Exclude<AlertKind, "deploy">,
  phase: "fire" | "resolve",
  detail: string,
  fetcher: Fetcher
) {
  try {
    if (!project.notifyUrlEnc) return;
    const { url, kind } = parseNotifyUrl(open(project.notifyUrlEnc, context(project.id)));
    await post(
      url,
      kind,
      {
        title: titleFor(project, type, phase),
        detail,
        link: appLink(`/projects/${project.slug}`),
      },
      fetcher
    );
  } catch (err) {
    console.warn("alert notification failed", err instanceof Error ? err.message : err);
  }
}

/**
 * Record that an alert fired and send it unless its channel is off or alerts
 * are muted. The history row is written either way. It stays open until
 * `resolveAlert`, so the caller fires once per crossing.
 */
export async function openAlert(
  project: AlertProject,
  type: Exclude<AlertKind, "deploy">,
  message: string,
  now = new Date(),
  fetcher: Fetcher = fetch
) {
  const db = await getDb();
  const muted = isMuted(project, now);
  await db.insert(schema.alertEvents).values({
    id: newId(),
    projectId: project.id,
    type,
    message: message.slice(0, 400),
    firedAt: now,
    muted,
  });
  const channel = type === "down" ? project.alertOnDown : project.alertOnResource;
  if (channel && !muted) await deliver(project, type, "fire", message, fetcher);
}

/**
 * Close the open alert of this type and say it is over. Nothing is sent when
 * the channel is off, alerts are muted now, or the alert was muted when it
 * fired (the webhook never heard about it).
 */
export async function resolveAlert(
  project: AlertProject,
  type: Exclude<AlertKind, "deploy">,
  message: string,
  now = new Date(),
  fetcher: Fetcher = fetch
) {
  const db = await getDb();
  const where = and(
    eq(schema.alertEvents.projectId, project.id),
    eq(schema.alertEvents.type, type),
    isNull(schema.alertEvents.resolvedAt)
  );
  const rows = await db.select({ muted: schema.alertEvents.muted }).from(schema.alertEvents).where(where);
  if (rows.length) await db.update(schema.alertEvents).set({ resolvedAt: now }).where(where);
  const channel = type === "down" ? project.alertOnRecovery : project.alertOnResource;
  if (channel && !isMuted(project, now) && !rows.some((r) => r.muted)) {
    await deliver(project, type, "resolve", message, fetcher);
  }
}
