import { authed, handle, ok } from "@/server/http";
import { fetchUsage } from "@/server/runtime-info";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ usage: await fetchUsage(user.id, id) });
});
