import { z } from "zod";
import { authed, handle, ok } from "@/server/http";
import { requireProjectFeature } from "@/server/permission-guards";
import { terminals, TERMINAL_LIMITS } from "@/server/terminal";

type Ctx = { params: Promise<{ id: string }> };

const sizeInput = z
  .object({
    cols: z.number().int().min(TERMINAL_LIMITS.minCols).max(TERMINAL_LIMITS.maxCols).default(80),
    rows: z.number().int().min(TERMINAL_LIMITS.minRows).max(TERMINAL_LIMITS.maxRows).default(24),
  })
  .default({ cols: 80, rows: 24 });

/**
 * Open a shell on the project's container. Only ever called from the Open
 * button; it is not a link and not a prefetch. Replies with the session id the
 * other routes need, and the text the page shows about who the shell runs as.
 * Refused with 403 before any SSH work when the owner has the terminal off.
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  await requireProjectFeature(user.id, id, "terminal");
  const raw = await req.json().catch(() => undefined);
  const size = sizeInput.parse(raw);
  const session = await terminals().open(user.id, id, size);
  return ok(session, 201);
});

/** The signed-in user's open terminal for this project, if any, so the page can offer Resume. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ session: terminals().active(user.id, id) });
});
