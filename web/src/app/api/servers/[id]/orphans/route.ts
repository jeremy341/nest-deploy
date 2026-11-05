import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { requireServerFeature } from "@/server/permission-guards";
import { enforceRateLimit } from "@/server/rate-limit";
import { removeOrphans } from "@/server/inventory";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  /** Unit names (nd-foo.service) or folder names (foo). Each one is validated again on the server. */
  ids: z.array(z.string().max(200)).min(1).max(50),
});

/**
 * Stop and remove orphaned Nest Deploy services and delete orphaned folders.
 * Returns one result per id. Anything that belongs to a project is refused.
 * 403 when the owner has leftover removal off; 429 past 10 requests a minute.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  // Before the body is validated or SSH is touched.
  await requireServerFeature(user.id, id, "orphanRemoval");
  enforceRateLimit("orphanRemoval", user.id);
  const { ids } = await readJson(req, body);
  return ok({ results: await removeOrphans(user.id, id, ids) });
});
