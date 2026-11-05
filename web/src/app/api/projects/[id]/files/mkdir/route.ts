import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { makeProjectDir } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ path: z.string().max(2000) });

/** Create a folder (one level) inside shared/ or current/. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { path } = await readJson(req, input);
  return ok(await makeProjectDir(user.id, id, path), 201);
});
