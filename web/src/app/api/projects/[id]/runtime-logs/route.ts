import { authed, handle, ok } from "@/server/http";
import { fetchRuntimeLogs } from "@/server/runtime-info";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const n = Number(req.nextUrl.searchParams.get("lines") ?? 200);
  const lines = Number.isFinite(n) ? Math.min(Math.max(n, 1), 1000) : 200;
  return ok({ lines: await fetchRuntimeLogs(user.id, id, lines) });
});
