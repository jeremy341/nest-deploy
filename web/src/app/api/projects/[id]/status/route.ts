import { authed, handle, ok } from "@/server/http";
import { fetchServiceStatus } from "@/server/service-status";

type Ctx = { params: Promise<{ id: string }> };

/** Live state of the production service, read over SSH. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ status: await fetchServiceStatus(user.id, id) });
});
