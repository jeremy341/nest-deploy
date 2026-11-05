import { HttpError, authed, handle, ok } from "@/server/http";
import { requireProjectFeature } from "@/server/permission-guards";
import { enforceRateLimit } from "@/server/rate-limit";
import { UPLOAD_LIMIT, checkProjectWrite, writeProjectFile } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Write a file. The request body is the file's bytes (a text edit and an
 * upload are the same thing); `path` and `overwrite` are in the query.
 * Without `overwrite=1` an existing file is left alone and the answer is 409.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const overwrite = req.nextUrl.searchParams.get("overwrite") === "1";

  // The switch and the rate limit come before the body is read or SSH is touched.
  await requireProjectFeature(user.id, id, "fileWrites");
  enforceRateLimit("fileWrite", user.id);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > UPLOAD_LIMIT) {
    throw new HttpError(413, "That file is over the 50 MB limit.", "too_large");
  }
  // Ownership and the path rules run before the body is read, so a refused
  // request costs nothing. writeProjectFile checks them again.
  await checkProjectWrite(user.id, id, path);
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > UPLOAD_LIMIT) {
    throw new HttpError(413, "That file is over the 50 MB limit.", "too_large");
  }
  // Next.js buffers request bodies up to a limit and cuts the rest. A short
  // body must never be saved as if it were the whole file.
  if (Number.isFinite(declared) && declared > 0 && body.length !== declared) {
    throw new HttpError(400, "The upload arrived incomplete. Nothing was saved.", "short_body");
  }
  return ok(await writeProjectFile(user.id, id, path, body, overwrite));
});
