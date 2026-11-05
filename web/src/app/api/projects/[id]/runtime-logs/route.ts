import { authed, handle, ok } from "@/server/http";
import { parseLogLevel, parseLogRange } from "@/lib/log-filter";
import { fetchRuntimeLogs } from "@/server/runtime-info";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const n = Number(req.nextUrl.searchParams.get("lines") ?? 200);
  const lines = Number.isFinite(n) ? Math.min(Math.max(n, 1), 1000) : 200;
  const q = req.nextUrl.searchParams.get("q") ?? "";
  // `range` (1h, 24h, 7d) becomes journalctl --since; `level` is all or problems.
  const range = req.nextUrl.searchParams.has("range")
    ? parseLogRange(req.nextUrl.searchParams.get("range"))
    : undefined;
  const level = parseLogLevel(req.nextUrl.searchParams.get("level"));
  return ok({ lines: await fetchRuntimeLogs(user.id, id, lines, q, { range, level }) });
});
