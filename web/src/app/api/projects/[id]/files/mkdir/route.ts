import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { requireProjectFeature } from "@/server/permission-guards";
import { enforceRateLimit } from "@/server/rate-limit";
import { makeProjectDir } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ path: z.string().max(2000) });

/** Create a folder (one level) inside shared/. current/ is the live release and is refused (403 read_only). */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await requireProjectFeature(user.id, id, "fileWrites");
  enforceRateLimit("fileWrite", user.id);
  const { path } = await readJson(req, input);
  return ok(await makeProjectDir(user.id, id, path), 201);
});
