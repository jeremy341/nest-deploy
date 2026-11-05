import { NextResponse, type NextRequest } from "next/server";
import { bearerFrom, principalFor, type Principal } from "@/server/api-tokens";
import { callEndpoint, endpointById, enforceApiRate, type Endpoint } from "@/server/api-v1";
import { handle, HttpError } from "@/server/http";

/**
 * HTTP glue for the public API and the MCP endpoint. The ONLY credential
 * accepted here is `Authorization: Bearer ndp_...`. Cookies are never read, so
 * a signed-in browser session cannot act through the API.
 */

const WWW_AUTHENTICATE = { "WWW-Authenticate": "Bearer" };

/** The same answer for a missing header, a wrong prefix, and an unknown, revoked or expired token. */
export async function authenticate(req: Request): Promise<Principal> {
  const secret = bearerFrom(req);
  if (secret === null) {
    throw new HttpError(
      401,
      "Send an access token as an Authorization: Bearer ndp_... header.",
      "unauthorized",
      WWW_AUTHENTICATE
    );
  }
  const principal = await principalFor(secret);
  if (!principal) {
    throw new HttpError(401, "That access token is not valid.", "unauthorized", WWW_AUTHENTICATE);
  }
  return principal;
}

/** Authenticated responses are never cached. */
export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const MAX_BODY_BYTES = 16 * 1024;

/** Read a size-capped text body. Nothing is logged. */
export async function readCappedText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "The request body is too large.", "too_large");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new HttpError(413, "The request body is too large.", "too_large");
  }
  return text;
}

/** The endpoint's body fields, from an optional JSON object body. Unknown fields are refused. */
async function readBodyFields(ep: Endpoint, req: Request): Promise<Record<string, unknown>> {
  const allowed = Object.keys(ep.body);
  if (allowed.length === 0) return {};
  const text = (await readCappedText(req, MAX_BODY_BYTES)).trim();
  if (text === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be JSON", "bad_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object", "bad_json");
  }
  const fields = parsed as Record<string, unknown>;
  const unknown = Object.keys(fields).find((k) => !allowed.includes(k));
  if (unknown !== undefined) {
    throw new HttpError(400, `Unknown field "${unknown.slice(0, 60)}". Allowed: ${allowed.join(", ")}.`, "validation");
  }
  return fields;
}

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

/** A route handler for one endpoint of the shared list. */
export function v1Route(id: string) {
  const ep = endpointById(id);
  if (!ep) throw new Error(`Unknown API endpoint: ${id}`);

  // Bearer only: there is no cookie, so there is nothing for a cross-site page to ride on.
  return handle<Ctx>(
    async (req: NextRequest, ctx) => {
      const principal = await authenticate(req);
      enforceApiRate(principal, ep.bucket);

      const params = await ctx.params;
      const query: Record<string, unknown> = {};
      for (const key of Object.keys(ep.query)) {
        const v = req.nextUrl.searchParams.get(key);
        if (v !== null) query[key] = v;
      }
      const path: Record<string, unknown> = {};
      for (const key of Object.keys(ep.pathParams)) path[key] = params[key];

      // Path values win, so a body field can never retarget the id in the URL.
      const body = await readBodyFields(ep, req);
      const data = await callEndpoint(principal, ep, { ...query, ...body, ...path });
      return jsonResponse(data, ep.status);
    },
    { skipOriginCheck: true }
  );
}
