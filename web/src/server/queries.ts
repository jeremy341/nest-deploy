import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { notFound } from "@/server/http";
import { listServers, publicServer } from "@/server/servers";
import { notifySummary } from "@/server/notify";
import { usageFromProbe } from "@/server/runtime-info";
import { durationText, timeAgo, uiState, type UiState } from "@/lib/status";

/**
 * Read models for the dashboard. They return plain, serialisable objects with
 * times already formatted, so pages and client components can use them as is.
 */

export type ProjectView = {
  id: string;
  slug: string;
  name: string;
  repo: string | null;
  repoUrl: string;
  branch: string;
  runtime: string;
  startCommand: string | null;
  port: number;
  healthPath: string;
  autoDeploy: boolean;
  /** True when a deploy hook exists. The URL is only ever shown when it is created. */
  hookActive: boolean;
  hookCreatedAt: string | null;
  notify: { kind: "discord" | "slack"; on: "all" | "failures" } | null;
  serverId: string;
  nestUsername: string;
  domains: string[];
  /** State of the most recent deployment, or null if never deployed. */
  state: UiState | null;
  lastCommit: string | null;
  lastSha: string | null;
  lastAge: string | null;
  latestDeploymentId: string | null;
};

export type DeploymentView = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  env: "production" | "preview";
  state: UiState;
  rawState: string;
  source: string;
  branch: string;
  sha: string | null;
  commit: string | null;
  author: string | null;
  age: string;
  duration: string;
  port: number;
  isCurrent: boolean;
  cleanedUp: boolean;
  error: string | null;
  createdAt: string;
};

type DeploymentRow = typeof schema.deployments.$inferSelect;

function toDeploymentView(
  d: DeploymentRow,
  project: { id: string; slug: string; name: string }
): DeploymentView {
  return {
    id: d.id,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    env: d.env,
    state: uiState(d.state),
    rawState: d.state,
    source: d.source,
    branch: d.branch,
    sha: d.commitSha,
    commit: d.commitMessage,
    author: d.author,
    age: timeAgo(d.createdAt),
    duration: durationText(d.startedAt, d.finishedAt),
    port: d.port,
    isCurrent: d.isCurrent,
    cleanedUp: d.cleanedUp,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function projectViews(userId: string): Promise<ProjectView[]> {
  const db = await getDb();
  const projects = await db
    .select({ p: schema.projects, nest: schema.servers.nestUsername })
    .from(schema.projects)
    .innerJoin(schema.servers, eq(schema.servers.id, schema.projects.serverId))
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
  if (projects.length === 0) return [];

  const deployments = await db
    .select({ d: schema.deployments })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deployments.projectId))
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.deployments.createdAt));
  const latest = new Map<string, DeploymentRow>();
  for (const { d } of deployments) {
    if (!latest.has(d.projectId)) latest.set(d.projectId, d);
  }

  const domains = await db
    .select()
    .from(schema.domains)
    .where(eq(schema.domains.userId, userId));

  return projects.map(({ p, nest }) => {
    const d = latest.get(p.id);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      repo: p.repoFullName,
      repoUrl: p.repoUrl,
      branch: p.productionBranch,
      runtime: p.runtime,
      startCommand: p.startCommand,
      port: p.port,
      healthPath: p.healthPath,
      autoDeploy: p.autoDeploy,
      hookActive: Boolean(p.hookHash),
      hookCreatedAt: p.hookCreatedAt ? p.hookCreatedAt.toISOString() : null,
      notify: notifySummary(p),
      serverId: p.serverId,
      nestUsername: nest,
      domains: domains.filter((x) => x.projectId === p.id).map((x) => x.domain),
      state: d ? uiState(d.state) : null,
      lastCommit: d?.commitMessage ?? null,
      lastSha: d?.commitSha?.slice(0, 7) ?? null,
      lastAge: d ? timeAgo(d.createdAt) : null,
      latestDeploymentId: d?.id ?? null,
    };
  });
}

export async function projectBySlug(userId: string, slug: string) {
  const views = await projectViews(userId);
  const v = views.find((p) => p.slug === slug);
  if (!v) throw notFound("Project not found");
  return v;
}

export async function deploymentViews(
  userId: string,
  options: { projectId?: string; limit?: number } = {}
): Promise<DeploymentView[]> {
  const db = await getDb();
  const rows = await db
    .select({ d: schema.deployments, p: schema.projects })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deployments.projectId))
    .where(
      options.projectId
        ? and(eq(schema.projects.userId, userId), eq(schema.deployments.projectId, options.projectId))
        : eq(schema.projects.userId, userId)
    )
    .orderBy(desc(schema.deployments.createdAt))
    .limit(options.limit ?? 100);
  return rows.map(({ d, p }) => toDeploymentView(d, p));
}

export async function deploymentView(userId: string, deploymentId: string) {
  const db = await getDb();
  const row = await db
    .select({ d: schema.deployments, p: schema.projects })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deployments.projectId))
    .where(and(eq(schema.deployments.id, deploymentId), eq(schema.projects.userId, userId)))
    .get();
  if (!row) throw notFound("Deployment not found");
  const domains = await db
    .select()
    .from(schema.domains)
    .where(eq(schema.domains.projectId, row.p.id));
  return {
    deployment: toDeploymentView(row.d, row.p),
    project: { id: row.p.id, slug: row.p.slug, name: row.p.name, port: row.p.port },
    domains: domains.map((x) => x.domain),
  };
}

export async function serverViews(userId: string) {
  const rows = await listServers(userId);
  return rows.map((r) => {
    const view = publicServer(r);
    return {
      ...view,
      usage: view.probe ? usageFromProbe(view.probe, r.lastCheckedAt ?? new Date()) : null,
    };
  });
}

export type ServerView = Awaited<ReturnType<typeof serverViews>>[number];

export async function domainViews(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      d: schema.domains,
      nest: schema.servers.nestUsername,
      project: schema.projects.name,
    })
    .from(schema.domains)
    .innerJoin(schema.servers, eq(schema.servers.id, schema.domains.serverId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.domains.projectId))
    .where(eq(schema.domains.userId, userId))
    .orderBy(schema.domains.createdAt);
  return rows.map(({ d, nest, project }) => ({
    id: d.id,
    domain: d.domain,
    port: d.port,
    status: d.status,
    serverId: d.serverId,
    nestUsername: nest,
    projectName: project,
    cname: d.domain.endsWith(".hackclub.app") ? null : `${nest}.hackclub.app`,
    age: timeAgo(d.createdAt),
  }));
}
