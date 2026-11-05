import { authed, handle, ok } from "@/server/http";
import { readProjectFile } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

/** Read a text file (first 1 MB). Binary files come back flagged, without content. */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  return ok(await readProjectFile(user.id, id, path));
});
