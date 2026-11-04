import { authed, handle, ok } from "@/server/http";
import { getServerForUser, publicServer, testServer } from "@/server/servers";

type Ctx = { params: Promise<{ id: string }> };

/** Connect over SSH, pin the host key, and report what the container supports. */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const result = await testServer(user.id, id);
  const server = publicServer(await getServerForUser(user.id, id));
  return ok({ result, server });
});
