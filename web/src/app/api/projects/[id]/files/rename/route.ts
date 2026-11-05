import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { requireProjectFeature } from "@/server/permission-guards";
import { enforceRateLimit } from "@/server/rate-limit";
import { renameProjectPath } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ from: z.string().max(2000), to: z.string().max(2000) });

/** Rename or move a file or folder within shared/ and current/. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await requireProjectFeature(user.id, id, "fileWrites");
  enforceRateLimit("fileWrite", user.id);
  const { from, to } = await readJson(req, input);
  return ok(await renameProjectPath(user.id, id, from, to));
});
