import { eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/server/config";
import { open, seal } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
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

    const { url, kind } = parseNotifyUrl(open(project.notifyUrlEnc, context(project.id)));
    const where = dep.env === "production" ? "production" : "a preview";
    const what = dep.commitMessage ? `"${dep.commitMessage.slice(0, 120)}"` : `${dep.source} deployment`;
    const sha = dep.commitSha ? ` ${dep.commitSha.slice(0, 7)}` : "";
    const took = durationText(dep.startedAt, dep.finishedAt);
    await post(
      url,
      kind,
      {
        title:
          dep.state === "ready"
            ? `${project.name} is live in ${where}`
            : `${project.name} failed to deploy to ${where}`,
        detail:
          dep.state === "ready"
            ? `${dep.branch}${sha}: ${what} (${took})`
            : `${dep.branch}${sha}: ${(dep.error ?? "The deployment failed.").slice(0, 200)}`,
        link: appLink(`/projects/${project.slug}/deployments/${dep.id}`),
      },
      fetcher
    );
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
