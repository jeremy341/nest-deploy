import { authed, handle, ok } from "@/server/http";
import { listDeployments } from "@/server/projects";

export const GET = handle(async (req) => {
  const user = await authed();
  const projectId = req.nextUrl.searchParams.get("project") ?? undefined;
  const rows = await listDeployments(user.id, projectId);
  return ok({
    deployments: rows.map((r) => ({
      ...r.deployment,
      projectName: r.projectName,
      projectSlug: r.projectSlug,
    })),
  });
});
