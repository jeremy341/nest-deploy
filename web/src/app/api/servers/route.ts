import { z } from "zod";
import { authed, handle, ok, readJson } from "@/server/http";
import { createServer, listServers, publicServer } from "@/server/servers";

export const GET = handle(async () => {
  const user = await authed();
  return ok({ servers: (await listServers(user.id)).map(publicServer) });
});

const body = z.object({ nestUsername: z.string().min(1).max(64) });

/** Generate a dedicated key for a Nest account. Returns the public key to paste. */
export const POST = handle(async (req) => {
  const user = await authed();
  const { nestUsername } = await readJson(req, body);
  return ok({ server: publicServer(await createServer(user.id, nestUsername)) }, 201);
});
