import { NextResponse } from "next/server";
import { createApiToken, createTokenInput, listApiTokens } from "@/server/api-tokens";
import { authed, handle, readJson } from "@/server/http";

/** Never cache anything here: a response can hold a token secret. */
const NO_STORE = { "Cache-Control": "no-store" };

/** The signed-in user's tokens. The list never includes a secret or a hash. */
export const GET = handle(async () => {
  const user = await authed();
  return NextResponse.json({ tokens: await listApiTokens(user.id) }, { headers: NO_STORE });
});

/**
 * Create a token. The response carries the secret once; it cannot be read
 * again. Browser sign-in only: a bearer token cannot reach this route.
 */
export const POST = handle(async (req) => {
  const user = await authed();
  const input = await readJson(req, createTokenInput);
  const { token, secret } = await createApiToken(user.id, input);
  return NextResponse.json({ token, secret }, { status: 201, headers: NO_STORE });
});
