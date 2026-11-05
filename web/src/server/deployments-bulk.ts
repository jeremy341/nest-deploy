import { eq } from "drizzle-orm";
import { canBulkCancel, canBulkDelete, type BulkCandidate } from "@/lib/deployments-filter";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { getDb, schema } from "@/server/db";
import { unitName } from "@/server/deploy/layout";
import { removePreview } from "@/server/deploy/remote";
import { HttpError } from "@/server/http";
import { cancelDeployment, ownedDeployment } from "@/server/projects";
import { getServerForUser, withServerSession } from "@/server/servers";
import { probeSession } from "@/server/ssh/probe";

/** Most ids one bulk request may carry. */
export const MAX_BULK = 50;

export type BulkItemResult = { id: string; ok: boolean; message?: string };

type Row = typeof schema.deployments.$inferSelect;

function candidate(dep: Row): BulkCandidate {
  return {
    env: dep.env,
    rawState: dep.state,
    isCurrent: dep.isCurrent,
    cleanedUp: dep.cleanedUp,
    createdAt: dep.createdAt,
  };
}

/** Cancel one preview that is still running, using the same logic as the single-item route. */
export async function cancelPreview(userId: string, deploymentId: string) {
  const { dep } = await ownedDeployment(userId, deploymentId);
  if (!canBulkCancel(candidate(dep))) {
    throw new HttpError(409, "Only previews that are queued or running can be canceled in bulk.", "conflict");
  }
  await cancelDeployment(userId, deploymentId);
}

/**
 * Stop and remove one old preview from the server, then mark it cleaned up.
 * The record stays in the list, as it does when previews are cleaned up
 * automatically.
 */
export async function deletePreview(userId: string, deploymentId: string) {
  const { dep, project } = await ownedDeployment(userId, deploymentId);
  if (!canBulkDelete(candidate(dep))) {
    throw new HttpError(409, "Only old previews that are not live or removed can be deleted in bulk.", "conflict");
  }
  const server = await getServerForUser(userId, project.serverId);
  const res = await withServerSession(server, async (s) => {
    const probe = await probeSession(s);
    return s.script(
      removePreview({
        home: probe.home,
        slug: project.slug,
        releaseId: dep.releaseId,
        unit: unitName(project.slug, { releaseId: dep.releaseId }),
        unitDir: config().UNIT_DIR,
      }),
      { timeoutMs: 60_000 }
    );
  });
  if (res.code !== 0) {
    throw new HttpError(502, "Could not remove the preview from your container.", "upstream");
  }
  const db = await getDb();
  await db.update(schema.deployments).set({ cleanedUp: true }).where(eq(schema.deployments.id, dep.id));
  await audit(userId, "deploy.preview_delete", project.id, { branch: dep.branch });
}

/** Run `fn` for each id in turn. One failure never stops the rest. */
export async function runBulk(
  ids: string[],
  fn: (id: string) => Promise<void>
): Promise<BulkItemResult[]> {
  const unique = [...new Set(ids)];
  const results: BulkItemResult[] = [];
  for (const id of unique) {
    try {
      await fn(id);
      results.push({ id, ok: true });
    } catch (e) {
      const message =
        e instanceof HttpError ? e.message : "Something went wrong on our side.";
      if (!(e instanceof HttpError)) console.error("Bulk deployment action failed", e);
      results.push({ id, ok: false, message });
    }
  }
  return results;
}
