import { authed, handle, ok } from "@/server/http";
import { restartService } from "@/server/runtime-info";

type Ctx = { params: Promise<{ id: string }> };

/** Restart the production service on the user's container. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await restartService(user.id, id);
  return ok({ ok: true });
});
