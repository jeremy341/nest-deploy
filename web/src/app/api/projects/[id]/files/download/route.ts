import { authed, handle } from "@/server/http";
import { downloadProjectFile } from "@/server/files";

type Ctx = { params: Promise<{ id: string }> };

/** Content-Disposition value: an ASCII fallback plus the real name (RFC 5987). */
function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\%]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Send a file to the browser. Always as a download, never rendered inline:
 * the bytes are the user's own files and must not run in this site's origin.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  const user = await authed();
  const { id } = await params;
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const file = await downloadProjectFile(user.id, id, path);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(file.bytes.length),
      "content-disposition": attachment(file.name),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});
