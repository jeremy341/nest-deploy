import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { renameProjectPath } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ from: z.string().max(2000), to: z.string().max(2000) });

/** Rename or move a file or folder within shared/ and current/. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { from, to } = await readJson(req, input);
  return ok(await renameProjectPath(user.id, id, from, to));
});
