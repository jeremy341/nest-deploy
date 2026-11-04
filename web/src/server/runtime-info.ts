import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { DEFAULT_UNIT_DIR, unitName } from "@/server/deploy/layout";
import { removePreview, removeProject, runtimeLogs } from "@/server/deploy/remote";
import { HttpError } from "@/server/http";
import { getProjectForUser } from "@/server/projects";
import { getServerForUser, withServerSession } from "@/server/servers";
import { probeSession, type NestProbe } from "@/server/ssh/probe";

/** Live output of the production service, read from journald over SSH. */
export async function fetchRuntimeLogs(userId: string, projectId: string, lines = 200) {
  const project = await getProjectForUser(userId, projectId);
  const server = await getServerForUser(userId, project.serverId);
  const res = await withServerSession(server, (s) =>
    s.script(runtimeLogs(unitName(project.slug), lines), { timeoutMs: 30_000 })
  );
  if (res.code !== 0) {
    throw new HttpError(502, "Could not read the logs from your container.", "upstream");
  }
  return res.stdout.split(/\r?\n/).filter((l) => l.length > 0);
}

export type Usage = {
  cpuLoad: number | null;
  cpus: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  diskUsedMb: number | null;
  diskTotalMb: number | null;
  checkedAt: string;
};

export function usageFromProbe(p: NestProbe, at = new Date()): Usage {
  return {
    cpuLoad: p.load1,
    cpus: p.cpus,
    memUsedMb: p.memUsedMb,
    memTotalMb: p.memTotalMb,
    diskUsedMb: p.diskUsedMb,
    diskTotalMb: p.diskTotalMb,
    checkedAt: at.toISOString(),
  };
}

/** Read fresh numbers from the container and remember them. */
export async function fetchUsage(userId: string, serverId: string): Promise<Usage> {
  const server = await getServerForUser(userId, serverId);
  const probe = await withServerSession(server, probeSession);
  const db = await getDb();
  await db
    .update(schema.servers)
    .set({ probe: JSON.stringify(probe), lastCheckedAt: new Date(), status: "connected", lastError: null })
    .where(eq(schema.servers.id, server.id));
  return usageFromProbe(probe);
}

/**
 * Stop the service and delete the project's releases from the server. Previews
 * go too. `deleteData` also removes the shared data folder, so it is opt-in.
 */
export async function removeProjectFromServer(
  userId: string,
  projectId: string,
  options: { deleteData?: boolean; unitDir?: string } = {}
) {
  const project = await getProjectForUser(userId, projectId);
  const server = await getServerForUser(userId, project.serverId);
  const unitDir = options.unitDir ?? DEFAULT_UNIT_DIR;
  const db = await getDb();

  const previews = await db
    .select()
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, project.id),
        eq(schema.deployments.env, "preview"),
        eq(schema.deployments.cleanedUp, false)
      )
    );

  await withServerSession(server, async (s) => {
    const probe = await probeSession(s);
    for (const p of previews) {
      await s.script(
        removePreview({
          home: probe.home,
          slug: project.slug,
          releaseId: p.releaseId,
          unit: unitName(project.slug, { releaseId: p.releaseId }),
          unitDir,
        }),
        { timeoutMs: 60_000 }
      );
    }
    const res = await s.script(
      removeProject({
        home: probe.home,
        slug: project.slug,
        unit: unitName(project.slug),
        unitDir,
        deleteData: options.deleteData ?? false,
      }),
      { timeoutMs: 60_000 }
    );
    if (res.code !== 0) {
      throw new HttpError(502, "Could not remove the project from your container.", "upstream");
    }
  });

  await db
    .update(schema.deployments)
    .set({ cleanedUp: true })
    .where(eq(schema.deployments.projectId, project.id));
}
