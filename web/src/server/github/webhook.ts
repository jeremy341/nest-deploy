import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { enqueueDeployment } from "@/server/projects";

export type WebhookResult = {
  handled: boolean;
  deployments: string[];
  note?: string;
};

type PushPayload = {
  ref?: string;
  after?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
  head_commit?: { message?: string; author?: { name?: string; username?: string } } | null;
  pusher?: { name?: string };
  installation?: { id?: number };
};

const ZERO_SHA = /^0+$/;

/**
 * Turn a GitHub event into deployments. Pushes to a project's production
 * branch deploy to production; pushes to other branches build a preview.
 */
export async function handleGithubEvent(
  event: string,
  payload: unknown
): Promise<WebhookResult> {
  if (event === "ping") return { handled: true, deployments: [], note: "pong" };
  if (event === "installation") return handleInstallation(payload);
  if (event !== "push") return { handled: false, deployments: [], note: `ignored ${event}` };

  const p = payload as PushPayload;
  const fullName = p.repository?.full_name;
  if (!fullName || !p.ref?.startsWith("refs/heads/")) {
    return { handled: false, deployments: [], note: "not a branch push" };
  }
  const branch = p.ref.slice("refs/heads/".length);
  if (p.deleted || !p.after || ZERO_SHA.test(p.after)) {
    return { handled: false, deployments: [], note: "branch deleted" };
  }

  const db = await getDb();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.repoFullName, fullName), eq(schema.projects.autoDeploy, true)));

  const created: string[] = [];
  for (const project of projects) {
    // Only trust events for installations we know about.
    if (p.installation?.id && project.installationId && p.installation.id !== project.installationId) {
      continue;
    }

    // A push that is already queued or running for this commit is a retry.
    const dup = await db
      .select({ id: schema.deployments.id })
      .from(schema.deployments)
      .where(
        and(
          eq(schema.deployments.projectId, project.id),
          eq(schema.deployments.branch, branch),
          eq(schema.deployments.commitSha, p.after),
          inArray(schema.deployments.state, ["queued", "building", "deploying"])
        )
      )
      .get();
    if (dup) continue;

    const dep = await enqueueDeployment(project, {
      env: branch === project.productionBranch ? "production" : "preview",
      source: "webhook",
      branch,
      commitSha: p.after,
      commitMessage: p.head_commit?.message?.split("\n")[0]?.slice(0, 300) ?? null,
      author: p.head_commit?.author?.username ?? p.head_commit?.author?.name ?? p.pusher?.name ?? null,
    });
    created.push(dep.id);
  }
  return { handled: true, deployments: created };
}

async function handleInstallation(payload: unknown): Promise<WebhookResult> {
  const p = payload as { action?: string; installation?: { id?: number } };
  if (p.action === "deleted" && p.installation?.id) {
    const db = await getDb();
    await db
      .delete(schema.githubInstallations)
      .where(eq(schema.githubInstallations.id, p.installation.id));
    // Projects keep their record but lose private-repo access until relinked.
    await db
      .update(schema.projects)
      .set({ installationId: null })
      .where(eq(schema.projects.installationId, p.installation.id));
    return { handled: true, deployments: [], note: "installation removed" };
  }
  return { handled: false, deployments: [], note: `ignored installation ${p.action}` };
}
