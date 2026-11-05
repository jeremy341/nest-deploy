import { checkDomainApp, verifyDomain } from "@/server/domains";
import { authed, handle, ok } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DNS check first (status and reason are unchanged), then, if DNS is right,
 * the app check over HTTPS. The result is added as `app`.
 */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const dns = await verifyDomain(user.id, id);
  const app = await checkDomainApp(user.id, id, dns.status);
  return ok({ ...dns, app });
});
