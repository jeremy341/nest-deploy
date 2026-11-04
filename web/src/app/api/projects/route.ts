import { authed, handle, ok } from "@/server/http";
import { createProject, listProjects } from "@/server/projects";

export const GET = handle(async () => {
  const user = await authed();
  return ok({ projects: await listProjects(user.id) });
});

export const POST = handle(async (req) => {
  const user = await authed();
  const body = await req.json().catch(() => ({}));
  return ok({ project: await createProject(user.id, body) }, 201);
});
