import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { attachPullRequest, closePullRequestPreviews } from "@/server/github/pulls";
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
  if (event === "pull_request") return handlePullRequest(payload);
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

type PullPayload = {
  action?: string;
  repository?: { full_name?: string };
  installation?: { id?: number };
  pull_request?: {
    number?: number;
    draft?: boolean;
    head?: { ref?: string; sha?: string; repo?: { full_name?: string } | null };
  };
};

const BUILD_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

/**
 * A pull request opened, updated or closed. Same-repository pull requests get a
 * preview (usually the push already started it, so this only links the two);
 * closing one cleans up after it. Forks are never built.
 */
async function handlePullRequest(payload: unknown): Promise<WebhookResult> {
  const p = payload as PullPayload;
  const fullName = p.repository?.full_name;
  const pr = p.pull_request;
  const number = pr?.number;
  const branch = pr?.head?.ref;
  const sha = pr?.head?.sha;
  if (!fullName || !pr || !number || !branch || !sha) {
    return { handled: false, deployments: [], note: "incomplete pull request event" };
  }
  const action = p.action ?? "";
  if (action !== "closed" && !BUILD_ACTIONS.has(action)) {
    return { handled: false, deployments: [], note: `ignored pull_request ${action}` };
  }

  const db = await getDb();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.repoFullName, fullName));
  const trusted = projects.filter(
    (x) => !(p.installation?.id && x.installationId && p.installation.id !== x.installationId)
  );

  if (action === "closed") {
    // Not awaited: it talks to the user's server, and GitHub wants a quick answer.
    for (const project of trusted) void closePullRequestPreviews(project.id, number);
    return { handled: true, deployments: [], note: "pull request closed" };
  }

  if (pr.head?.repo?.full_name !== fullName) {
    return { handled: false, deployments: [], note: "pull request from a fork is not built" };
  }
  if (pr.draft) return { handled: false, deployments: [], note: "draft pull request" };

  const created: string[] = [];
  for (const project of trusted) {
    if (!project.autoDeploy || branch === project.productionBranch) continue;
    const existing = await attachPullRequest(project.id, branch, sha, number);
    if (existing) continue;
    const dep = await enqueueDeployment(project, {
      env: "preview",
      source: "webhook",
      branch,
      commitSha: sha,
      prNumber: number,
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
