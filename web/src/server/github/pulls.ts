import { and, eq, inArray } from "drizzle-orm";
import { config } from "@/server/config";
import { getDb, schema } from "@/server/db";
import { unitName } from "@/server/deploy/layout";
import { removePreview } from "@/server/deploy/remote";
import { GithubError, headers, installationToken } from "@/server/github/app";
import { withServerSession } from "@/server/servers";
import { probeSession } from "@/server/ssh/probe";

/**
 * Pull-request previews.
 *
 * A same-repository pull request builds as a preview like any other branch.
 * This module adds the parts that belong to the pull request itself: one
 * comment that is updated in place as previews finish, and cleanup when the
 * pull request closes. Pull requests from forks are never built, because that
 * would run a stranger's code with the project's environment variables.
 */

const API = "https://api.github.com";
const MARKER = "<!-- nest-deploy-preview -->";
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type FetchLike = typeof fetch;

/**
 * The comment text. It is visible to everyone who can read the repository, so
 * it carries no error output, no server name and no environment values: just
 * the state, the commit and a link that only the project's owner can open.
 */
export function previewComment(args: {
  projectName: string;
  branch: string;
  sha: string | null;
  state: "ready" | "error";
  port: number;
  link: string;
}): string {
  const commit = args.sha ? ` at \`${args.sha.slice(0, 7)}\`` : "";
  const head =
    args.state === "ready"
      ? `### Preview ready\n\n**${args.projectName}** built from \`${args.branch}\`${commit}.`
      : `### Preview failed\n\nThe build of **${args.projectName}** from \`${args.branch}\`${commit} did not finish.`;
  const body =
    args.state === "ready"
      ? `It is running on its own port (${args.port}) on the owner's Nest container. Nest only gives it a public address once a domain is mapped to that port.`
      : "The build log is in Nest Deploy.";
  return `${head}\n\n${body}\n\n[Open the deployment](${args.link})\n\n${MARKER}`;
}

/** Create the pull request's Nest Deploy comment, or update it if it is already there. */
export async function upsertPullRequestComment(
  installationId: number,
  repo: string,
  prNumber: number,
  body: string,
  fetchImpl: FetchLike = fetch
) {
  if (!REPO.test(repo) || !Number.isInteger(prNumber) || prNumber < 1) {
    throw new GithubError("Not a valid pull request.");
  }
  const token = await installationToken(installationId, fetchImpl);
  const base = `${API}/repos/${repo}/issues`;

  const list = await fetchImpl(`${base}/${prNumber}/comments?per_page=100`, { headers: headers(token) });
  if (!list.ok) throw new GithubError(`Could not read the pull request (${list.status}).`, list.status);
  const comments = (await list.json()) as { id: number; body?: string; user?: { type?: string } }[];
  // Only touch a comment our own app wrote.
  const mine = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(MARKER));

  const res = mine
    ? await fetchImpl(`${base}/comments/${mine.id}`, {
        method: "PATCH",
        headers: headers(token, { "content-type": "application/json" }),
        body: JSON.stringify({ body }),
      })
    : await fetchImpl(`${base}/${prNumber}/comments`, {
        method: "POST",
        headers: headers(token, { "content-type": "application/json" }),
        body: JSON.stringify({ body }),
      });
  if (!res.ok) throw new GithubError(`Could not write the comment (${res.status}).`, res.status);
}

/**
 * Called when a deployment reaches a final state. Comments on its pull request
 * if it has one. Never throws: a missing permission must not affect a deploy.
 */
export async function commentDeploymentOnPr(deploymentId: string, fetchImpl: FetchLike = fetch) {
  try {
    const db = await getDb();
    const dep = await db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.id, deploymentId))
      .get();
    if (!dep?.prNumber || dep.env !== "preview") return;
    if (dep.state !== "ready" && dep.state !== "error") return;
    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, dep.projectId))
      .get();
    if (!project?.repoFullName || !project.installationId) return;

    await upsertPullRequestComment(
      project.installationId,
      project.repoFullName,
      dep.prNumber,
      previewComment({
        projectName: project.name,
        branch: dep.branch,
        sha: dep.commitSha,
        state: dep.state,
        port: dep.port,
        link: `${config().APP_URL.replace(/\/$/, "")}/projects/${project.slug}/deployments/${dep.id}`,
      }),
      fetchImpl
    );
  } catch (err) {
    // 403 usually means the app was not granted pull request write access.
    console.warn("pull request comment failed", err instanceof Error ? err.message : err);
  }
}

/**
 * A pull request closed: stop anything of its still building and remove the
 * previews it left on the server. Best effort; the periodic cleanup catches
 * whatever this misses.
 */
export async function closePullRequestPreviews(projectId: string, prNumber: number) {
  const db = await getDb();
  const project = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) return { canceled: 0, removed: 0 };

  const rows = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, project.id),
        eq(schema.deployments.env, "preview"),
        eq(schema.deployments.prNumber, prNumber),
        eq(schema.deployments.cleanedUp, false)
      )
    );

  const running = rows.filter((d) => ["queued", "building", "deploying"].includes(d.state));
  for (const d of running) {
    await db
      .update(schema.deployments)
      .set({ state: "canceled", finishedAt: new Date(), error: "Pull request closed" })
      .where(eq(schema.deployments.id, d.id));
    await db
      .update(schema.jobs)
      .set({ state: "failed", error: "Pull request closed" })
      .where(and(eq(schema.jobs.deploymentId, d.id), eq(schema.jobs.state, "queued")));
  }

  const onServer = rows.filter((d) => d.state === "ready");
  if (onServer.length === 0) return { canceled: running.length, removed: 0 };

  const server = await db.select().from(schema.servers).where(eq(schema.servers.id, project.serverId)).get();
  if (!server) return { canceled: running.length, removed: 0 };
  let removed = 0;
  try {
    await withServerSession(server, async (s) => {
      const probe = await probeSession(s);
      for (const d of onServer) {
        const res = await s
          .script(
            removePreview({
              home: probe.home,
              slug: project.slug,
              releaseId: d.releaseId,
              unit: unitName(project.slug, { releaseId: d.releaseId }),
              unitDir: config().UNIT_DIR,
            }),
            { timeoutMs: 60_000 }
          )
          .catch(() => null);
        if (res && res.code === 0) {
          await db.update(schema.deployments).set({ cleanedUp: true }).where(eq(schema.deployments.id, d.id));
          removed++;
        }
      }
    });
  } catch (err) {
    console.warn("pull request cleanup failed", err instanceof Error ? err.message : err);
  }
  return { canceled: running.length, removed };
}

/** Mark finished deployments of a branch and commit as belonging to a pull request. */
export async function attachPullRequest(
  projectId: string,
  branch: string,
  sha: string,
  prNumber: number
): Promise<string | null> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, projectId),
        eq(schema.deployments.env, "preview"),
        eq(schema.deployments.branch, branch),
        eq(schema.deployments.commitSha, sha),
        eq(schema.deployments.cleanedUp, false),
        inArray(schema.deployments.state, ["queued", "building", "deploying", "ready", "error"])
      )
    )
    .get();
  if (!existing) return null;
  await db.update(schema.deployments).set({ prNumber }).where(eq(schema.deployments.id, existing.id));
  // It may already have finished, in which case nothing else will comment.
  if (existing.state === "ready" || existing.state === "error") void commentDeploymentOnPr(existing.id);
  return existing.id;
}
