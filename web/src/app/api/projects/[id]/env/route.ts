import { authed, handle, ok } from "@/server/http";
import { listEnvVars, setEnvVar } from "@/server/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Names and targets only. Values are never returned. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ env: await listEnvVars(user.id, id) });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await setEnvVar(user.id, id, await req.json().catch(() => ({})));
  return ok({ env: await listEnvVars(user.id, id) }, 201);
});
