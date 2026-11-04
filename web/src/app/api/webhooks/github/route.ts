import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/server/config";
import { verifyWebhookSignature } from "@/server/github/app";
import { handleGithubEvent } from "@/server/github/webhook";

/**
 * GitHub webhook. Public by design, so the only thing that lets a request in
 * is a valid HMAC signature over the raw body.
 */
export async function POST(req: NextRequest) {
  const secret = config().GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  try {
    const result = await handleGithubEvent(req.headers.get("x-github-event") ?? "", payload);
    return NextResponse.json(result);
  } catch (err) {
    console.error("webhook failed", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
