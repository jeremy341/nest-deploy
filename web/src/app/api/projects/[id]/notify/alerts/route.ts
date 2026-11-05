import { authed, handle, ok, readJson } from "@/server/http";
import { alertSettingsInput, getAlerts, setAlertSettings } from "@/server/notify";

type Ctx = { params: Promise<{ id: string }> };

/** Alert settings and the last 50 events for the project. */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const user = await authed();
  const { id } = await params;
  return ok(await getAlerts(user.id, id));
});

/** Change any of the alert settings. Fields left out stay as they are. */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const body = await readJson(req, alertSettingsInput);
  return ok({ settings: await setAlertSettings(user.id, id, body) });
});
