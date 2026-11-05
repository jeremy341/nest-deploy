import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { getPermissions, setPermissions } from "@/server/permissions";
import { terminals } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string }> };

/** Only these three switches, only booleans, at least one, nothing else. */
const patch = z
  .object({
    terminal: z.boolean().optional(),
    fileWrites: z.boolean().optional(),
    orphanRemoval: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Send at least one switch to change." });

/** The container permissions of one of the signed-in user's servers. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ permissions: await getPermissions(user.id, id) });
});

/**
 * Turn switches on or off. Turning the terminal off also closes the owner's
 * open terminals on this server, so the switch takes effect at once.
 */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const changes = await readJson(req, patch);
  const before = await getPermissions(user.id, id);
  const permissions = await setPermissions(user.id, id, changes);
  if (before.terminal && !permissions.terminal) {
    await terminals().closeAllForUser(user.id, "disabled", { serverId: id });
  }
  return ok({ permissions });
});
