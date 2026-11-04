import { authed, handle, ok } from "@/server/http";
import {
  deleteProjectRecords,
  getProjectForUser,
  updateProject,
} from "@/server/projects";
import { removeProjectFromServer } from "@/server/runtime-info";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ project: await getProjectForUser(user.id, id) });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return ok({ project: await updateProject(user.id, id, body) });
});

/**
 * ?remote=1 also stops the service and deletes the releases on Nest first, and
 * ?data=1 deletes the project's shared data folder too. Without them only the
 * records are removed and the app keeps running.
 */
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  if (q.get("remote") === "1") {
    await removeProjectFromServer(user.id, id, { deleteData: q.get("data") === "1" });
  }
  await deleteProjectRecords(user.id, id);
  return ok({ ok: true });
});
