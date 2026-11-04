import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { newId, open, seal } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { RUNTIMES } from "@/server/db/schema";
import { assertCloneUrl, BuildError } from "@/server/deploy/build";
import { isValidSlug, slugify } from "@/server/deploy/layout";
import { ENV_KEY, RESERVED_ENV } from "@/server/deploy/runtime";
import { HttpError, notFound } from "@/server/http";
import { getServerForUser } from "@/server/servers";

export type ProjectRow = typeof schema.projects.$inferSelect;
export type DeploymentRow = typeof schema.deployments.$inferSelect;

/** Previews get ports from this range so they never collide with production. */
export const PREVIEW_PORT_MIN = 20000;
export const PREVIEW_PORT_MAX = 29999;

const command = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !/[\r\n]/.test(v), "Commands must be a single line")
  .nullable()
  .optional();

const rootDir = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => !v.startsWith("/") && !v.split(/[\\/]/).includes(".."),
    "Root directory must be a relative path inside the repository"
  )
  .default(".");

const branch = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._/-]+$/, "Branch names may use letters, digits, . _ - and /")
  .refine((v) => !v.startsWith("-") && !v.includes(".."), "Invalid branch name");

const port = z
  .number()
  .int()
  .min(1024)
  .max(65535)
  .refine(
    (p) => p < PREVIEW_PORT_MIN || p > PREVIEW_PORT_MAX,
    `Ports ${PREVIEW_PORT_MIN} to ${PREVIEW_PORT_MAX} are reserved for previews`
  );

export const createProjectInput = z.object({
  serverId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().toLowerCase().optional(),
  repoUrl: z.string().trim().max(300),
  repoFullName: z.string().trim().max(200).nullable().optional(),
  installationId: z.number().int().positive().nullable().optional(),
  productionBranch: branch.default("main"),
  rootDir,
  runtime: z.enum(RUNTIMES),
  installCommand: command,
  buildCommand: command,
  startCommand: command,
  outputDir: z.string().trim().max(200).nullable().optional(),
  port,
  healthPath: z.string().trim().max(200).regex(/^\//, "Must start with /").default("/"),
  autoDeploy: z.boolean().default(true),
});

export const updateProjectInput = createProjectInput
  .omit({ serverId: true, slug: true, repoUrl: true, repoFullName: true, installationId: true })
  .partial();

export type CreateProjectInput = z.infer<typeof createProjectInput>;

async function assertOwned(userId: string, projectId: string): Promise<ProjectRow> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .get();
  if (!row) throw notFound("Project not found");
  return row;
}
export const getProjectForUser = assertOwned;

export async function listProjects(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
}

export async function createProject(userId: string, raw: unknown): Promise<ProjectRow> {
  const input = createProjectInput.parse(raw);
  const db = await getDb();
  await getServerForUser(userId, input.serverId);

  try {
    assertCloneUrl(input.repoUrl);
  } catch (e) {
    if (e instanceof BuildError) throw new HttpError(400, e.message, "validation");
    throw e;
  }

  const slug = input.slug ? input.slug : slugify(input.name);
  if (!isValidSlug(slug)) {
    throw new HttpError(
      400,
      "The project name must use lowercase letters, digits and hyphens (up to 40).",
      "validation"
    );
  }

  const clash = await db
    .select({ id: schema.projects.id, slug: schema.projects.slug, port: schema.projects.port })
    .from(schema.projects)
    .where(eq(schema.projects.serverId, input.serverId));
  if (clash.some((p) => p.slug === slug)) {
    throw new HttpError(409, `A project called "${slug}" already exists on this server.`, "conflict");
  }
  if (clash.some((p) => p.port === input.port)) {
    throw new HttpError(
      409,
      `Port ${input.port} is already used by another project on this server.`,
      "conflict"
    );
  }

  const id = newId();
  const now = new Date();
  await db.insert(schema.projects).values({
    id,
    userId,
    serverId: input.serverId,
    slug,
    name: input.name,
    repoUrl: input.repoUrl,
    repoFullName: input.repoFullName ?? null,
    installationId: input.installationId ?? null,
    productionBranch: input.productionBranch,
    rootDir: input.rootDir,
    runtime: input.runtime,
    installCommand: input.installCommand || null,
    buildCommand: input.buildCommand || null,
    startCommand: input.startCommand || null,
    outputDir: input.outputDir || null,
    port: input.port,
    healthPath: input.healthPath,
    autoDeploy: input.autoDeploy,
    createdAt: now,
    updatedAt: now,
  });
  return assertOwned(userId, id);
}

export async function updateProject(userId: string, projectId: string, raw: unknown) {
  const input = updateProjectInput.parse(raw);
  const project = await assertOwned(userId, projectId);
  const db = await getDb();

  if (input.port !== undefined && input.port !== project.port) {
    const others = await db
      .select({ port: schema.projects.port })
      .from(schema.projects)
      .where(and(eq(schema.projects.serverId, project.serverId)));
    if (others.some((p) => p.port === input.port)) {
      throw new HttpError(409, `Port ${input.port} is already used on this server.`, "conflict");
    }
  }

  const clean = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined)
  ) as Partial<typeof schema.projects.$inferInsert>;
  await db
    .update(schema.projects)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));
  return assertOwned(userId, projectId);
}

// ------------------------------------------------------------ environment

export const envInput = z.object({
  key: z
    .string()
    .trim()
    .regex(ENV_KEY, "Names use letters, digits and underscores, and do not start with a digit")
    .max(100)
    .refine((k) => !RESERVED_ENV.has(k.toUpperCase()), "That name is set by Nest Deploy"),
  value: z.string().max(10_000),
  target: z.enum(["all", "production", "preview"]).default("all"),
});

export async function setEnvVar(userId: string, projectId: string, raw: unknown) {
  const input = envInput.parse(raw);
  const project = await assertOwned(userId, projectId);
  const db = await getDb();

  const existing = await db
    .select({ id: schema.envVars.id })
    .from(schema.envVars)
    .where(
      and(
        eq(schema.envVars.projectId, project.id),
        eq(schema.envVars.key, input.key),
        eq(schema.envVars.target, input.target)
      )
    )
    .get();
  const valueEnc = seal(input.value, `env:${project.id}:${input.key}:${input.target}`);
  if (existing) {
    await db.update(schema.envVars).set({ valueEnc }).where(eq(schema.envVars.id, existing.id));
  } else {
    const count = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.envVars)
      .where(eq(schema.envVars.projectId, project.id))
      .get();
    if ((count?.n ?? 0) >= 100) {
      throw new HttpError(400, "A project can have up to 100 variables.", "limit");
    }
    await db.insert(schema.envVars).values({
      id: newId(),
      projectId: project.id,
      key: input.key,
      valueEnc,
      target: input.target,
      createdAt: new Date(),
    });
  }
}

/** Names and targets only. Values are never sent back to the browser. */
export async function listEnvVars(userId: string, projectId: string) {
  const project = await assertOwned(userId, projectId);
  const db = await getDb();
  const rows = await db
    .select({ id: schema.envVars.id, key: schema.envVars.key, target: schema.envVars.target })
    .from(schema.envVars)
    .where(eq(schema.envVars.projectId, project.id))
    .orderBy(schema.envVars.key);
  return rows;
}

export async function deleteEnvVar(userId: string, projectId: string, envId: string) {
  const project = await assertOwned(userId, projectId);
  const db = await getDb();
  await db
    .delete(schema.envVars)
    .where(and(eq(schema.envVars.id, envId), eq(schema.envVars.projectId, project.id)));
}

/** Only used by the worker and tests. */
export async function revealEnvVar(projectId: string, key: string, target: "all" | "production" | "preview") {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.envVars)
    .where(
      and(
        eq(schema.envVars.projectId, projectId),
        eq(schema.envVars.key, key),
        eq(schema.envVars.target, target)
      )
    )
    .get();
  return row ? open(row.valueEnc, `env:${projectId}:${key}:${target}`) : null;
}

// ------------------------------------------------------------ deployments

async function allocatePreviewPort(serverId: string): Promise<number> {
  const db = await getDb();
  const used = await db
    .select({ port: schema.deployments.port })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deployments.projectId))
    .where(
      and(
        eq(schema.projects.serverId, serverId),
        eq(schema.deployments.env, "preview"),
        eq(schema.deployments.cleanedUp, false),
        inArray(schema.deployments.state, ["queued", "building", "deploying", "ready"])
      )
    );
  const taken = new Set(used.map((u) => u.port));
  for (let p = PREVIEW_PORT_MIN; p <= PREVIEW_PORT_MAX; p++) {
    if (!taken.has(p)) return p;
  }
  throw new HttpError(409, "No free preview ports on this server.", "limit");
}

export type NewDeployment = {
  env: "production" | "preview";
  source: DeploymentRow["source"];
  branch: string;
  commitSha?: string | null;
  commitMessage?: string | null;
  author?: string | null;
  triggeredBy?: string | null;
  /** Reuse an existing release (rollback). */
  releaseId?: string;
  port?: number;
};

/** Insert a queued deployment and its job in one go. */
export async function enqueueDeployment(
  project: ProjectRow,
  input: NewDeployment,
  jobType: "deploy" | "rollback" = "deploy"
): Promise<DeploymentRow> {
  const db = await getDb();
  const id = newId();
  const port =
    input.port ??
    (input.env === "production" ? project.port : await allocatePreviewPort(project.serverId));

  await db.insert(schema.deployments).values({
    id,
    projectId: project.id,
    triggeredBy: input.triggeredBy ?? null,
    env: input.env,
    state: "queued",
    source: input.source,
    branch: input.branch,
    commitSha: input.commitSha ?? null,
    commitMessage: input.commitMessage ?? null,
    author: input.author ?? null,
    port,
    releaseId: input.releaseId ?? newId(),
    createdAt: new Date(),
  });
  await db.insert(schema.jobs).values({
    id: newId(),
    type: jobType,
    deploymentId: id,
    state: "queued",
    createdAt: new Date(),
  });
  return (await db.select().from(schema.deployments).where(eq(schema.deployments.id, id)).get())!;
}

/** Deploy a branch by hand (the "Deploy" button). */
export async function deployBranch(
  userId: string,
  projectId: string,
  branchName?: string
) {
  const project = await assertOwned(userId, projectId);
  const b = branchName ?? project.productionBranch;
  return enqueueDeployment(project, {
    env: b === project.productionBranch ? "production" : "preview",
    source: "manual",
    branch: b,
    triggeredBy: userId,
  });
}

/** Build the same commit again. */
export async function redeploy(userId: string, deploymentId: string) {
  const { project, dep } = await ownedDeployment(userId, deploymentId);
  return enqueueDeployment(project, {
    env: dep.env,
    source: "redeploy",
    branch: dep.branch,
    commitSha: dep.commitSha,
    commitMessage: dep.commitMessage,
    author: dep.author,
    triggeredBy: userId,
  });
}

/** Point production back at an earlier release that is still on the server. */
export async function rollback(userId: string, deploymentId: string) {
  const { project, dep } = await ownedDeployment(userId, deploymentId);
  if (dep.env !== "production") {
    throw new HttpError(400, "Only production deployments can be rolled back to.", "validation");
  }
  if (dep.state !== "ready") {
    throw new HttpError(400, "That deployment never finished, so there is nothing to roll back to.", "validation");
  }
  if (dep.cleanedUp) {
    throw new HttpError(409, "That release was removed from your server to save space.", "gone");
  }
  if (dep.isCurrent) {
    throw new HttpError(409, "That deployment is already live.", "conflict");
  }
  return enqueueDeployment(
    project,
    {
      env: "production",
      source: "rollback",
      branch: dep.branch,
      commitSha: dep.commitSha,
      commitMessage: dep.commitMessage,
      author: dep.author,
      triggeredBy: userId,
      releaseId: dep.releaseId,
      port: project.port,
    },
    "rollback"
  );
}

export async function cancelDeployment(userId: string, deploymentId: string) {
  const { dep } = await ownedDeployment(userId, deploymentId);
  const db = await getDb();
  if (!["queued", "building", "deploying"].includes(dep.state)) {
    throw new HttpError(409, "That deployment is already finished.", "conflict");
  }
  await db
    .update(schema.deployments)
    .set({ state: "canceled", finishedAt: new Date(), error: "Canceled" })
    .where(eq(schema.deployments.id, dep.id));
  await db
    .update(schema.jobs)
    .set({ state: "failed", error: "Canceled" })
    .where(and(eq(schema.jobs.deploymentId, dep.id), eq(schema.jobs.state, "queued")));
}

export async function ownedDeployment(userId: string, deploymentId: string) {
  const db = await getDb();
  const dep = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, deploymentId))
    .get();
  if (!dep) throw notFound("Deployment not found");
  const project = await assertOwned(userId, dep.projectId);
  return { dep, project };
}

export async function listDeployments(userId: string, projectId?: string, limit = 50) {
  const db = await getDb();
  const where = projectId
    ? and(eq(schema.projects.userId, userId), eq(schema.deployments.projectId, projectId))
    : eq(schema.projects.userId, userId);
  return db
    .select({ deployment: schema.deployments, projectName: schema.projects.name, projectSlug: schema.projects.slug })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.deployments.projectId))
    .where(where)
    .orderBy(desc(schema.deployments.createdAt))
    .limit(limit);
}

export async function deploymentLogs(userId: string, deploymentId: string, afterId = 0, limit = 1000) {
  await ownedDeployment(userId, deploymentId);
  const db = await getDb();
  return db
    .select()
    .from(schema.deploymentLogs)
    .where(
      and(
        eq(schema.deploymentLogs.deploymentId, deploymentId),
        sql`${schema.deploymentLogs.id} > ${afterId}`
      )
    )
    .orderBy(schema.deploymentLogs.id)
    .limit(limit);
}
