import { authed, handle, ok } from "@/server/http";
import { getProjectForUser } from "@/server/projects";
import { detectRoot } from "@/server/root-detect";

type Ctx = { params: Promise<{ id: string }> };

/** What is in `?root=<folder>` of the project's repository, read from GitHub. */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const project = await getProjectForUser(user.id, id);
  const root = req.nextUrl.searchParams.get("root") ?? project.rootDir;
  return ok({ detection: await detectRoot(project, root) });
});
