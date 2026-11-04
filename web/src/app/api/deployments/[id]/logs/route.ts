import { authed, handle, ok } from "@/server/http";
import { deploymentLogs } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Poll with ?after=<last id> to get only new lines. */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  return ok({ logs: await deploymentLogs(user.id, id, after) });
});
