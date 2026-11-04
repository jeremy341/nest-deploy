/**
 * Small fetch wrapper for the browser. Throws an Error with the server's own
 * message, so forms can show it as is.
 */
export async function api<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
