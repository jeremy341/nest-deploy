import { rmSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { open } from "@/server/crypto";
import { config, githubConfigured } from "@/server/config";
import { installationToken } from "@/server/github/app";
import { getDb, schema } from "@/server/db";
import { defaultBuilder, type Builder } from "@/server/deploy/build";
import {
  DEFAULT_UNIT_DIR,
  KEEP_PREVIEWS,
  KEEP_RELEASES,
  currentLink,
  incomingArchive,
  releaseDir,
  unitName,
} from "@/server/deploy/layout";
import { DeploymentLogger } from "@/server/deploy/logger";
import * as remote from "@/server/deploy/remote";
import {
  ENV_KEY,
  RESERVED_ENV,
  StartCommandError,
  renderEnvFile,
  resolveStartCommand,
} from "@/server/deploy/runtime";
import { notifyDeploymentFinished } from "@/server/notify";
import { connectToServer, type ServerRow } from "@/server/servers";
import { shellQuote, type NestSession } from "@/server/ssh/connection";
import { probeSession, type NestProbe } from "@/server/ssh/probe";

export class DeployError extends Error {}

export type PipelineDeps = {
  build: Builder;
  connect: (server: ServerRow) => Promise<NestSession>;
  /** Short-lived GitHub token for a private repo, if the App is set up. */
  installationToken?: (installationId: number) => Promise<string>;
  unitDir: string;
  healthTimeoutSeconds: number;
};

export function defaultDeps(): PipelineDeps {
  return {
    build: defaultBuilder,
    connect: connectToServer,
    installationToken: githubConfigured() ? (id) => installationToken(id) : undefined,
    unitDir: config().UNIT_DIR || DEFAULT_UNIT_DIR,
    healthTimeoutSeconds: 45,
  };
}

type Project = typeof schema.projects.$inferSelect;
type Deployment = typeof schema.deployments.$inferSelect;

async function load(deploymentId: string) {
  const db = await getDb();
  const dep = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, deploymentId))
    .get();
  if (!dep) throw new DeployError("Deployment not found");
  const project = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, dep.projectId))
    .get();
  if (!project) throw new DeployError("Project not found");
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, project.serverId))
    .get();
  if (!server) throw new DeployError("Server not found");
  return { db, dep, project, server };
}

/** Decrypted variables for one environment, minus names we reserve. */
export async function envForDeployment(
  projectId: string,
  env: "production" | "preview"
): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.envVars)
    .where(eq(schema.envVars.projectId, projectId));
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.target !== "all" && r.target !== env) continue;
    if (!ENV_KEY.test(r.key) || RESERVED_ENV.has(r.key)) continue;
    out[r.key] = open(r.valueEnc, `env:${projectId}:${r.key}:${r.target}`);
  }
  return out;
}

async function setState(
  id: string,
  state: Deployment["state"],
  extra: Partial<typeof schema.deployments.$inferInsert> = {}
) {
  const db = await getDb();
  await db.update(schema.deployments).set({ state, ...extra }).where(eq(schema.deployments.id, id));
  if (state === "ready" || state === "error") {
    // Fire and forget: notifyDeploymentFinished never throws.
    void notifyDeploymentFinished(id);
  }
}

async function stateOf(id: string) {
  const db = await getDb();
  return (
    await db.select({ s: schema.deployments.state }).from(schema.deployments).where(eq(schema.deployments.id, id)).get()
  )?.s;
}

/** Run a script on the container, streaming output into the log. */
async function run(
  session: NestSession,
  log: DeploymentLogger,
  label: string,
  script: string,
  timeoutMs = 120_000
) {
  const res = await session.script(script, {
    timeoutMs,
    onLine: (l, stream) => (stream === "stderr" ? log.warn(l) : log.info(l)),
  });
  if (res.code !== 0) {
    throw new DeployError(`${label} failed (exit ${res.code}).`);
  }
  return res;
}

async function getProbe(session: NestSession, server: ServerRow): Promise<NestProbe> {
  const probe = await probeSession(session);
  const db = await getDb();
  await db
    .update(schema.servers)
    .set({ probe: JSON.stringify(probe), lastCheckedAt: new Date() })
    .where(eq(schema.servers.id, server.id));
  return probe;
}

function unitPaths(project: Project, dep: Deployment, home: string) {
  const preview = dep.env === "preview" ? { releaseId: dep.releaseId } : undefined;
  const unit = unitName(project.slug, preview);
  const workDir = preview
    ? releaseDir(home, project.slug, dep.releaseId)
    : currentLink(home, project.slug);
  return { unit, workDir, envFile: `${workDir}/.env` };
}

async function healthy(
  session: NestSession,
  log: DeploymentLogger,
  unit: string,
  port: number,
  path: string,
  timeoutSeconds: number
): Promise<boolean> {
  const res = await session.script(
    remote.healthCheck({ unit, port, path, timeoutSeconds }),
    {
      timeoutMs: (timeoutSeconds + 15) * 1000,
      onLine: (l) => log.info(l),
    }
  );
  return res.code === 0;
}

async function logJournal(session: NestSession, log: DeploymentLogger, unit: string) {
  log.warn(`Last log lines from ${unit}:`);
  await session
    .script(remote.journalTail(unit, 30), { timeoutMs: 20_000, onLine: (l) => log.warn(l) })
    .catch(() => {});
}

/** The production deployment currently serving traffic, if any. */
async function currentProduction(projectId: string, excludeId?: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, projectId),
        eq(schema.deployments.env, "production"),
        eq(schema.deployments.isCurrent, true)
      )
    );
  return rows.find((r) => r.id !== excludeId) ?? null;
}

async function markCurrent(projectId: string, deploymentId: string) {
  const db = await getDb();
  await db
    .update(schema.deployments)
    .set({ isCurrent: false })
    .where(
      and(eq(schema.deployments.projectId, projectId), eq(schema.deployments.env, "production"))
    );
  await db
    .update(schema.deployments)
    .set({ isCurrent: true })
    .where(eq(schema.deployments.id, deploymentId));
}

/** Remove old releases and previews, on the server and in the records. */
async function cleanup(
  session: NestSession,
  log: DeploymentLogger,
  project: Project,
  home: string,
  unitDir: string,
  currentReleaseId: string | null
) {
  const db = await getDb();
  const all = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, project.id),
        eq(schema.deployments.state, "ready"),
        eq(schema.deployments.cleanedUp, false)
      )
    )
    .orderBy(desc(schema.deployments.createdAt));

  // Previews: keep the newest few, stop the rest.
  const previews = all.filter((d) => d.env === "preview");
  for (const old of previews.slice(KEEP_PREVIEWS)) {
    log.info(`Removing old preview ${old.releaseId.slice(0, 8)}`);
    await session
      .script(
        remote.removePreview({
          home,
          slug: project.slug,
          releaseId: old.releaseId,
          unit: unitName(project.slug, { releaseId: old.releaseId }),
          unitDir,
        }),
        { timeoutMs: 60_000 }
      )
      .catch(() => {});
    await db.update(schema.deployments).set({ cleanedUp: true }).where(eq(schema.deployments.id, old.id));
  }
  const keptPreviewReleases = previews.slice(0, KEEP_PREVIEWS).map((d) => d.releaseId);

  // Production: keep the newest few distinct releases plus the current one.
  const keep = new Set<string>(keptPreviewReleases);
  if (currentReleaseId) keep.add(currentReleaseId);
  const seen = new Set<string>();
  for (const d of all.filter((x) => x.env === "production")) {
    if (seen.size >= KEEP_RELEASES) break;
    seen.add(d.releaseId);
  }
  for (const r of seen) keep.add(r);

  await session
    .script(remote.pruneReleases(home, project.slug, [...keep]), {
      timeoutMs: 120_000,
      onLine: (l) => log.info(l),
    })
    .catch(() => {});

  for (const d of all.filter((x) => x.env === "production" && !keep.has(x.releaseId))) {
    await db.update(schema.deployments).set({ cleanedUp: true }).where(eq(schema.deployments.id, d.id));
  }
}

function throwIfCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new DeployError("The deployment was canceled.");
}

/** Build the project and release it. */
export async function runDeployJob(
  deploymentId: string,
  deps: PipelineDeps = defaultDeps(),
  signal: AbortSignal = new AbortController().signal
): Promise<void> {
  const { db, dep, project, server } = await load(deploymentId);
  const log = new DeploymentLogger(deploymentId);
  let workDir: string | null = null;
  let session: NestSession | null = null;

  try {
    if ((await stateOf(deploymentId)) !== "queued") return;
    await setState(deploymentId, "building", { startedAt: new Date() });
    log.info(
      `Deploying ${project.name} (${dep.env}) to ${server.nestUsername}@${server.host}`
    );

    const env = await envForDeployment(project.id, dep.env);
    const token =
      project.installationId && deps.installationToken
        ? await deps.installationToken(project.installationId)
        : null;
    log.setSecrets([...Object.values(env), token ?? ""]);

    // ---- build (off the Nest container)
    const built = await deps.build({
      deploymentId,
      runtime: {
        runtime: project.runtime,
        installCommand: project.installCommand,
        buildCommand: project.buildCommand,
        startCommand: project.startCommand,
        outputDir: project.outputDir,
      },
      rootDir: project.rootDir,
      source: {
        cloneUrl: project.repoUrl,
        token,
        branch: dep.branch,
        sha: dep.source === "redeploy" ? dep.commitSha : null,
      },
      env,
      log: log.log,
      signal,
    });
    workDir = built.workDir;
    throwIfCanceled(signal);
    await db
      .update(schema.deployments)
      .set({
        commitSha: built.commit.sha,
        commitMessage: built.commit.message,
        author: built.commit.author || dep.author,
        archiveBytes: built.sizeBytes,
      })
      .where(eq(schema.deployments.id, deploymentId));

    // ---- release on Nest
    await setState(deploymentId, "deploying");
    log.info("Connecting to your Nest container");
    session = await deps.connect(server);
    const probe = await getProbe(session, server);
    const home = probe.home;
    const unitInfo = unitPaths(project, dep, home);

    let startCommand: string;
    try {
      startCommand = resolveStartCommand(project, probe, dep.port);
    } catch (e) {
      if (e instanceof StartCommandError) throw new DeployError(e.message);
      throw e;
    }

    await run(session, log, "Preparing folders", remote.prepareDirs(home, project.slug));
    log.info(`Uploading ${(built.sizeBytes / 1e6).toFixed(1)} MB`);
    await session.uploadFile(built.archivePath, incomingArchive(home, project.slug, dep.releaseId));
    throwIfCanceled(signal);

    await run(
      session,
      log,
      "Unpacking the release",
      remote.unpackRelease({
        home,
        slug: project.slug,
        releaseId: dep.releaseId,
        sha256: built.sha256,
        remoteInstall: built.spec.remoteInstall,
      }),
      15 * 60_000
    );

    const relDir = releaseDir(home, project.slug, dep.releaseId);
    await session.writeFile(`${relDir}/.env`, renderEnvFile(env), "600");

    const venv =
      project.runtime === "python" && built.files.hasRequirements
        ? `${unitInfo.workDir}/.venv/bin`
        : undefined;
    await session.writeFile(
      `${deps.unitDir}/${unitInfo.unit}`,
      remote.unitFile({
        slug: project.slug,
        description: `Nest Deploy: ${project.name}${dep.env === "preview" ? ` (preview ${dep.releaseId.slice(0, 8)})` : ""}`,
        workDir: unitInfo.workDir,
        envFile: unitInfo.envFile,
        port: dep.port,
        startCommand,
        pathPrefix: venv,
      })
    );
    await run(session, log, "Registering the service", remote.installUnit(deps.unitDir, unitInfo.unit));
    throwIfCanceled(signal);

    // ---- switch over, with automatic revert
    const previous = dep.env === "production" ? await currentProduction(project.id, dep.id) : null;

    if (dep.env === "production") {
      await run(
        session,
        log,
        "Switching the release",
        remote.activateProduction({ home, slug: project.slug, releaseId: dep.releaseId, unit: unitInfo.unit })
      );
    } else {
      await run(session, log, "Starting the preview", remote.startUnit(unitInfo.unit));
    }

    log.info(`Waiting for the app to answer on port ${dep.port}`);
    const ok = await healthy(
      session,
      log,
      unitInfo.unit,
      dep.port,
      project.healthPath,
      deps.healthTimeoutSeconds
    );

    if (!ok) {
      await logJournal(session, log, unitInfo.unit);
      if (dep.env === "production" && previous) {
        log.warn("Reverting to the previous release");
        await run(
          session,
          log,
          "Reverting",
          remote.activateProduction({
            home,
            slug: project.slug,
            releaseId: previous.releaseId,
            unit: unitInfo.unit,
          })
        ).catch((e) => log.error(String(e.message ?? e)));
        const back = await healthy(session, log, unitInfo.unit, previous.port, project.healthPath, 20);
        log.info(
          back
            ? "The previous release is serving traffic again."
            : "The previous release did not come back either. Check the logs."
        );
      }
      throw new DeployError(
        `The new release did not become healthy on port ${dep.port}. Make sure your app listens on the PORT environment variable and on 0.0.0.0.`
      );
    }

    // ---- success
    if (dep.env === "production") await markCurrent(project.id, dep.id);
    log.info(
      dep.env === "production"
        ? `Live on port ${dep.port}. Map your domain to this port in the Nest dashboard.`
        : `Preview is running on port ${dep.port}. Map a domain to it in the Nest dashboard to open it.`
    );
    // Mark ready first so this release counts when old ones are cleaned up.
    await setState(deploymentId, "ready", { finishedAt: new Date() });
    await cleanup(session, log, project, home, deps.unitDir, dep.env === "production" ? dep.releaseId : (previous?.releaseId ?? null));
    await log.flush();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    await log.flush().catch(() => {});
    const canceled = signal.aborted || (await stateOf(deploymentId)) === "canceled";
    await setState(deploymentId, canceled ? "canceled" : "error", {
      error: message.slice(0, 500),
      finishedAt: new Date(),
    });
    if (!(err instanceof DeployError) && !canceled) {
      // Unexpected failures are still reported to the user, but also logged.
      console.error(`Deployment ${deploymentId} failed`, err);
    }
  } finally {
    session?.close();
    if (workDir) rmSync(workDir, { recursive: true, force: true });
    await log.flush().catch(() => {});
  }
}

/** Switch production back to an earlier release that is still on the server. */
export async function runRollbackJob(
  deploymentId: string,
  deps: PipelineDeps = defaultDeps()
): Promise<void> {
  const { dep, project, server } = await load(deploymentId);
  const log = new DeploymentLogger(deploymentId);
  let session: NestSession | null = null;

  try {
    if ((await stateOf(deploymentId)) !== "queued") return;
    await setState(deploymentId, "deploying", { startedAt: new Date() });
    log.info(`Rolling ${project.name} back to release ${dep.releaseId.slice(0, 8)}`);

    session = await deps.connect(server);
    const probe = await getProbe(session, server);
    const home = probe.home;
    const unit = unitName(project.slug);
    const previous = await currentProduction(project.id, dep.id);

    const exists = await session.exec(
      `test -d ${shellQuote(releaseDir(home, project.slug, dep.releaseId))}`
    );
    if (exists.code !== 0) {
      throw new DeployError(
        "That release is no longer on your server (old releases are removed to save disk space)."
      );
    }

    await run(
      session,
      log,
      "Switching the release",
      remote.activateProduction({ home, slug: project.slug, releaseId: dep.releaseId, unit })
    );
    const ok = await healthy(session, log, unit, dep.port, project.healthPath, deps.healthTimeoutSeconds);
    if (!ok) {
      await logJournal(session, log, unit);
      if (previous) {
        log.warn("Restoring the release that was live before");
        await run(
          session,
          log,
          "Restoring",
          remote.activateProduction({ home, slug: project.slug, releaseId: previous.releaseId, unit })
        ).catch((e) => log.error(String(e.message ?? e)));
      }
      throw new DeployError("The older release did not become healthy, so nothing was changed.");
    }

    await markCurrent(project.id, dep.id);
    log.info("Rollback complete. Database changes are not reversed.");
    await log.flush();
    await setState(deploymentId, "ready", { finishedAt: new Date() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(message);
    await log.flush().catch(() => {});
    await setState(deploymentId, "error", { error: message.slice(0, 500), finishedAt: new Date() });
    if (!(err instanceof DeployError)) console.error(`Rollback ${deploymentId} failed`, err);
  } finally {
    session?.close();
    await log.flush().catch(() => {});
  }
}

