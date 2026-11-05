import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { removeOrphans } from "@/server/inventory";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  /** Unit names (nd-foo.service) or folder names (foo). Each one is validated again on the server. */
  ids: z.array(z.string().max(200)).min(1).max(50),
});

/**
 * Stop and remove orphaned Nest Deploy services and delete orphaned folders.
 * Returns one result per id. Anything that belongs to a project is refused.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { ids } = await readJson(req, body);
  return ok({ results: await removeOrphans(user.id, id, ids) });
});
