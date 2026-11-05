import { authed, handle, ok, readJson } from "@/server/http";
import { clearMute, muteInput, setMute } from "@/server/notify";

type Ctx = { params: Promise<{ id: string }> };

/** Pause all alerts for 1 hour, 24 hours, or until resumed. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const body = await readJson(req, muteInput);
  return ok({ settings: await setMute(user.id, id, body) });
});

/** Resume alerts. */
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok({ settings: await clearMute(user.id, id) });
});
