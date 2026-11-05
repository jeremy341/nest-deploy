import { authed, handle, ok } from "@/server/http";
import { listProjectDir } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

/** List one folder inside the project's folder on the container. */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  return ok(await listProjectDir(user.id, id, path));
});
