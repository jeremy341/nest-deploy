import { authed, handle, ok } from "@/server/http";
import { getBuildSettings, getCloneSettings, listCloneSources } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Nothing here writes. Without `from`, returns this project's own build
 * settings and the projects (same server) that settings can be copied from.
 * With `?from=<project id>`, returns that project's build and run settings
 * (an allow-list: never variables, secrets, hooks, notification URLs, the port
 * or the repository) for the form to show. The user saves them with the
 * normal project update.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const from = req.nextUrl.searchParams.get("from");
  if (from) return ok({ settings: await getCloneSettings(user.id, id, from) });
  const [current, sources] = await Promise.all([
    getBuildSettings(user.id, id),
    listCloneSources(user.id, id),
  ]);
  return ok({ current, sources });
});
