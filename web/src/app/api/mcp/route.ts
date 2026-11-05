import { NextResponse, type NextRequest } from "next/server";
import { authenticate, jsonResponse, readCappedText } from "@/server/api-v1-http";
import { handle, HttpError } from "@/server/http";
import { handleMcpMessage, RPC } from "@/server/mcp";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * MCP over plain HTTP: one JSON-RPC message in, one JSON response out. Bearer
 * token only, like the REST API; cookies are never read.
 */
export const POST = handle(
  async (req: NextRequest) => {
    const principal = await authenticate(req);
    const text = await readCappedText(req, MAX_BODY_BYTES);

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return jsonResponse({ jsonrpc: "2.0", id: null, error: { code: RPC.parse, message: "Parse error" } }, 400);
    }

    const outcome = await handleMcpMessage(principal, raw);
    if (outcome.kind === "accepted") return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } });
    return jsonResponse(outcome.body, outcome.status);
  },
  { skipOriginCheck: true }
);

// There is no server-to-client stream and no session to end.
const notAllowed = handle(
  async () => {
    throw new HttpError(405, "This endpoint only accepts POST.", "method_not_allowed", { Allow: "POST" });
  },
  { skipOriginCheck: true }
);
export const GET = notAllowed;
export const DELETE = notAllowed;
