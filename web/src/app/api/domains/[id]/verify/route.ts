import { verifyDomain } from "@/server/domains";
import { authed, handle, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok(await verifyDomain(user.id, id));
});
