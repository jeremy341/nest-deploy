import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/server/config";
import { randomToken, sha256Hex } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { enqueueDeployment, getProjectForUser, type DeploymentRow } from "@/server/projects";

/**
 * Deploy hooks: a secret URL that starts a deployment when it receives a POST,
 * for CI systems and scripts that cannot use the GitHub App.
 *
 * The token is shown once, when it is created. Only its SHA-256 is stored, so a
 * copy of the database cannot be turned into working hook URLs.
 */

const TOKEN_PREFIX = "ndh_";

export function hookUrl(token: string): string {
  return `${config().APP_URL.replace(/\/$/, "")}/api/hooks/deploy/${token}`;
}

/** Create or replace the hook. Replacing invalidates the old URL at once. */
export async function createDeployHook(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const token = TOKEN_PREFIX + randomToken(24);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ hookHash: sha256Hex(token), hookCreatedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await db.insert(schema.auditLog).values({
    userId,
    action: "hook.create",
    target: project.id,
    at: new Date(),
  });
  return { token, url: hookUrl(token) };
}

export async function revokeDeployHook(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const db = await getDb();
  await db
    .update(schema.projects)
    .set({ hookHash: null, hookCreatedAt: null, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  await db.insert(schema.auditLog).values({
    userId,
    action: "hook.revoke",
    target: project.id,
    at: new Date(),
  });
}

const hookBody = z
  .object({
    branch: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._/-]+$/, "Branch names may use letters, digits, . _ - and /")
      .refine((v) => !v.startsWith("-") && !v.includes(".."), "Invalid branch name")
      .optional(),
  })
  .strict();

/**
 * Start a deployment from a hook token. Unknown tokens look exactly like
 * missing ones. A second call while a deployment is still running is refused,
 * so a runaway script cannot fill the queue.
 */
export async function triggerDeployHook(token: string, rawBody: unknown): Promise<DeploymentRow> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 100) throw notFound("Unknown hook");
  const body = hookBody.safeParse(rawBody ?? {});
  if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid input", "validation");

  const db = await getDb();
  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.hookHash, sha256Hex(token)))
    .get();
  if (!project) throw notFound("Unknown hook");

  const running = await db
    .select({ id: schema.deployments.id })
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, project.id),
        inArray(schema.deployments.state, ["queued", "building", "deploying"])
      )
    )
    .get();
  if (running) {
    throw new HttpError(409, "A deployment is already running for this project.", "busy");
  }

  const branch = body.data.branch ?? project.productionBranch;
  const dep = await enqueueDeployment(project, {
    env: branch === project.productionBranch ? "production" : "preview",
    source: "hook",
    branch,
    commitMessage: "Triggered by deploy hook",
    author: "deploy hook",
    triggeredBy: null,
  });
  await db.insert(schema.auditLog).values({
    userId: project.userId,
    action: "hook.trigger",
    target: project.id,
    meta: JSON.stringify({ deployment: dep.id, branch }),
    at: new Date(),
  });
  return dep;
}

export async function hookStatus(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  return { active: Boolean(project.hookHash), createdAt: project.hookCreatedAt };
}
