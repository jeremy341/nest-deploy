import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { requireProjectFeature } from "@/server/permission-guards";
import { enforceRateLimit } from "@/server/rate-limit";
import { deleteProjectPath } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ path: z.string().max(2000), recursive: z.boolean().default(false) });

/** Delete a file, or with `recursive` a folder and everything in it. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await requireProjectFeature(user.id, id, "fileWrites");
  enforceRateLimit("fileWrite", user.id);
  const { path, recursive } = await readJson(req, input);
  return ok(await deleteProjectPath(user.id, id, path, recursive));
});
