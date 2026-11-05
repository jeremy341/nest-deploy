import { NextResponse } from "next/server";
import { buildOpenApi } from "@/server/api-v1-openapi";

/** Public on purpose: it describes the API and holds no data. */
export function GET() {
  return NextResponse.json(buildOpenApi(), { headers: { "Cache-Control": "public, max-age=300" } });
}
