import { NextResponse } from "next/server";
import { revokeApiToken } from "@/server/api-tokens";
import { authed, handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Revoke one of the signed-in user's tokens. Someone else's token, or one already revoked, is a 404. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await revokeApiToken(user.id, id);
  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
});
