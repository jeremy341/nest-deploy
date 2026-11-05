import { z } from "zod";
import { MAX_BULK, cancelPreview, runBulk } from "@/server/deployments-bulk";
import { authed, handle, ok, readJson } from "@/server/http";

const Body = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK) });

/** Per-item results: { results: [{ id, ok, message? }] }. Each id is checked on its own. */
export const POST = handle(async (req) => {
  const user = await authed();
  const { ids } = await readJson(req, Body);
  const results = await runBulk(ids, (id) => cancelPreview(user.id, id));
  return ok({ results });
});
