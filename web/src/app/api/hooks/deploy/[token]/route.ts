import { handle, HttpError, ok } from "@/server/http";
import { triggerDeployHook } from "@/server/hooks";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Deploy hook. Public by design: the secret in the URL is the credential, so
 * there is no cookie and no Origin check. An optional JSON body may name a
 * branch: { "branch": "feature-x" }.
 */
export const POST = handle<Ctx>(
  async (req, { params }) => {
    const { token } = await params;
    const text = await req.text();
    let body: unknown = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, "Request body must be JSON", "bad_json");
      }
    }
    const dep = await triggerDeployHook(token, body);
    return ok({ deployment: { id: dep.id, state: dep.state, branch: dep.branch, env: dep.env } }, 202);
  },
  { skipOriginCheck: true }
);
