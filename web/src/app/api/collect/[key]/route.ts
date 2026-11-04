import { type NextRequest } from "next/server";
import { recordPageview } from "@/server/analytics";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ key: string }> };

// Any site may report to its own key, so this answers every origin. It only
// ever writes a page view; it reads nothing and returns nothing.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

export const POST = handle<Ctx>(
  async (req, { params }) => {
    const { key } = await params;
    // sendBeacon sends text/plain, so read the body as text and parse it ourselves.
    const raw = await req.text();
    let body: unknown = {};
    try {
      body = JSON.parse(raw.slice(0, 5000));
    } catch {
      /* a malformed body is dropped by the validator */
    }
    try {
      await recordPageview(key, body, {
        ip: clientIp(req),
        ua: req.headers.get("user-agent") ?? "",
      });
    } catch {
      /* bad input is dropped, and looks the same as success from outside */
    }
    // The answer is the same whether or not the key exists, so keys cannot be probed.
    return new Response(null, { status: 204, headers: CORS });
  },
  { skipOriginCheck: true }
);
