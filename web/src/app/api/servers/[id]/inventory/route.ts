import { authed, handle, ok } from "@/server/http";
import { getInventory } from "@/server/inventory";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Read what is on the container and set it against the signed-in user's
 * projects. Read-only. Unreachable containers come back as a plain 502/504
 * message, never as a stack trace.
 */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ inventory: await getInventory(user.id, id) });
});
