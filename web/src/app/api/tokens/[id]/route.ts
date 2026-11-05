import { NextResponse } from "next/server";
import { revokeApiToken, updateApiToken, updateTokenInput } from "@/server/api-tokens";
import { authed, handle, readJson } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Rename a token, change its scopes or its expiry. Send any of `name`,
 * `scopes` and `expiresInDays` (7, 30, 90 or 365, counted from now). Someone
 * else's or an unknown token is a 404; a revoked one is a 409. Returns the
 * updated summary, never the secret.
 */
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const input = await readJson(req, updateTokenInput);
  return NextResponse.json({ token: await updateApiToken(user.id, id, input) }, { headers: NO_STORE });
});

/** Revoke one of the signed-in user's tokens. Someone else's token, or one already revoked, is a 404. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await revokeApiToken(user.id, id);
  return NextResponse.json({ revoked: true }, { headers: NO_STORE });
});
