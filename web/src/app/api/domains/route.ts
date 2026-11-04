import { addDomain, listDomains } from "@/server/domains";
import { authed, handle, ok } from "@/server/http";

export const GET = handle(async () => {
  const user = await authed();
  return ok({ domains: await listDomains(user.id) });
});

export const POST = handle(async (req) => {
  const user = await authed();
  const body = await req.json().catch(() => ({}));
  return ok(await addDomain(user.id, body), 201);
});
