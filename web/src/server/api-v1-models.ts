import { z } from "zod";
import type { Principal } from "@/server/api-tokens";
import { DEPLOY_STATES, RUNTIMES } from "@/server/db/schema";
import { notFound } from "@/server/http";
import {
  deploymentView,
  deploymentViews,
  domainViews,
  projectViews,
  type DeploymentView,
  type ProjectView,
} from "@/server/queries";

/**
 * The public shapes of projects, deployments, domains and usage, and the
 * functions that turn the dashboard's read models into them. Only the fields
 * named here ever leave the server.
 */

const iso = z.string().describe("ISO 8601 time, UTC.");

export const deploymentSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    projectSlug: z.string(),
    env: z.enum(["production", "preview"]).describe("Production for the project's production branch, preview for any other."),
    state: z.enum(DEPLOY_STATES),
    source: z.string().describe("What started it: manual, webhook, hook, redeploy or rollback."),
    branch: z.string(),
    sha: z.string().nullable().describe("Full commit SHA, once known."),
    commit: z.string().nullable().describe("Commit message."),
    pr: z.number().int().nullable().describe("Pull request number for previews built from one."),
    author: z.string().nullable(),
    isCurrent: z.boolean().describe("True when this release is the one serving traffic."),
    cleanedUp: z.boolean().describe("True when the release was removed from the server, so it cannot be rolled back to."),
    error: z.string().nullable().describe("Why it failed or was canceled."),
    createdAt: iso,
    durationMs: z.number().int().nullable().describe("Build time. Null while running or if it never started."),
  })
  .meta({ id: "Deployment" });
export type PublicDeployment = z.infer<typeof deploymentSchema>;

export const deploymentSummarySchema = deploymentSchema
  .pick({ id: true, env: true, state: true, branch: true, sha: true, commit: true, author: true, createdAt: true, durationMs: true })
  .meta({ id: "DeploymentSummary" });

export const projectSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    repo: z.string().nullable().describe("GitHub repository as owner/name."),
    branch: z.string().describe("The production branch."),
    runtime: z.enum(RUNTIMES),
    port: z.number().int(),
    startCommand: z.string().nullable(),
    healthPath: z.string(),
    autoDeploy: z.boolean(),
    serverId: z.string(),
    monitor: z.enum(["unknown", "up", "down"]).describe("Result of the last uptime check."),
    state: z.enum(DEPLOY_STATES).nullable().describe("State of the latest deployment, or null if never deployed."),
    latestDeployment: deploymentSummarySchema.nullable(),
  })
  .meta({ id: "Project" });
export type PublicProject = z.infer<typeof projectSchema>;

export const domainSchema = z
  .object({
    id: z.string(),
    domain: z.string(),
    status: z.enum(["pending", "valid", "invalid"]),
    port: z.number().int(),
    projectId: z.string().nullable(),
    projectName: z.string().nullable(),
    serverId: z.string(),
    cname: z.string().nullable().describe("The CNAME target to point the domain at, or null for built-in domains."),
  })
  .meta({ id: "Domain" });

export const usageSchema = z
  .object({
    serverId: z.string(),
    cpuLoad: z.number().nullable().describe("1-minute load average."),
    cpus: z.number().int().nullable(),
    memUsedMb: z.number().nullable(),
    memTotalMb: z.number().nullable(),
    diskUsedMb: z.number().nullable(),
    diskTotalMb: z.number().nullable(),
    checkedAt: iso,
  })
  .meta({ id: "Usage" });

export function toDeployment(v: DeploymentView): PublicDeployment {
  return {
    id: v.id,
    projectId: v.projectId,
    projectSlug: v.projectSlug,
    env: v.env,
    state: v.rawState as PublicDeployment["state"],
    source: v.source,
    branch: v.branch,
    sha: v.sha,
    commit: v.commit,
    pr: v.pr,
    author: v.author,
    isCurrent: v.isCurrent,
    cleanedUp: v.cleanedUp,
    error: v.error,
    createdAt: v.createdAt,
    durationMs: v.durationMs,
  };
}

export function toProject(v: ProjectView, latest: DeploymentView | null): PublicProject {
  // Not exposed: deploy hook, analytics key, notification and status page settings,
  // the Nest username and the domain names (those need the domains:read scope).
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    repo: v.repo,
    branch: v.branch,
    runtime: v.runtime as PublicProject["runtime"],
    port: v.port,
    startCommand: v.startCommand,
    healthPath: v.healthPath,
    autoDeploy: v.autoDeploy,
    serverId: v.serverId,
    monitor: v.monitor,
    state: latest ? (latest.rawState as PublicDeployment["state"]) : null,
    latestDeployment: latest
      ? {
          id: latest.id,
          env: latest.env,
          state: latest.rawState as PublicDeployment["state"],
          branch: latest.branch,
          sha: latest.sha,
          commit: latest.commit,
          author: latest.author,
          createdAt: latest.createdAt,
          durationMs: latest.durationMs,
        }
      : null,
  };
}

export async function latestFor(userId: string, v: ProjectView): Promise<DeploymentView | null> {
  if (!v.latestDeploymentId) return null;
  const [d] = await deploymentViews(userId, { projectId: v.id, limit: 1 });
  return d ?? null;
}

/** One of the principal's projects in its public shape, or 404. */
export async function publicProjectFor(p: Principal, projectId: string): Promise<PublicProject> {
  const view = (await projectViews(p.userId)).find((v) => v.id === projectId);
  if (!view) throw notFound("Project not found");
  return toProject(view, await latestFor(p.userId, view));
}

export async function requireView(p: Principal, deploymentId: string) {
  return (await deploymentView(p.userId, deploymentId)).deployment;
}

/** One of the principal's domains in its public shape, or 404. */
export async function publicDomainFor(p: Principal, domainId: string) {
  const row = (await domainViews(p.userId)).find((d) => d.id === domainId);
  if (!row) throw notFound("Domain not found");
  return {
    id: row.id,
    domain: row.domain,
    status: row.status,
    port: row.port,
    projectId: row.projectId,
    projectName: row.projectName,
    serverId: row.serverId,
    cname: row.cname,
  };
}
