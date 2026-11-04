import { authed, handle, ok } from "@/server/http";
import { ownedDeployment } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const { dep, project } = await ownedDeployment(user.id, id);
  return ok({
    deployment: dep,
    project: { id: project.id, name: project.name, slug: project.slug },
  });
});
