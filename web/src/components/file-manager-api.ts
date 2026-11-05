/** Browser side of the file routes. Errors carry the server's code and message. */

export class FileApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FileApiError";
  }
}

async function failure(res: Response): Promise<FileApiError> {
  const body = await res.json().catch(() => ({}));
  return new FileApiError(
    body?.error?.message ?? `The request failed (${res.status}).`,
    body?.error?.code ?? "error",
    res.status
  );
}

function networkFailure(): FileApiError {
  return new FileApiError("Could not reach Nest Deploy. Check your connection and try again.", "network", 0);
}

export async function fileGet<T>(base: string, op: "list" | "read", path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}/${op}?path=${encodeURIComponent(path)}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw networkFailure();
  }
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export async function filePost<T = unknown>(base: string, op: "mkdir" | "rename" | "delete", body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw networkFailure();
  }
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

/** Save text. The body is the file; the server decides nothing from its type. */
export async function fileSaveText(base: string, path: string, text: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${base}/write?path=${encodeURIComponent(path)}&overwrite=1`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: text,
    });
  } catch {
    throw networkFailure();
  }
  if (!res.ok) throw await failure(res);
}

/** Upload one file with progress. Resolves on success; rejects with FileApiError. */
export function fileUpload(
  base: string,
  path: string,
  file: File,
  opts: { overwrite: boolean; onProgress: (fraction: number) => void; register: (abort: () => void) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/write?path=${encodeURIComponent(path)}&overwrite=${opts.overwrite ? 1 : 0}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress(1);
        resolve();
        return;
      }
      let code = "error";
      let message = `The upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText);
        code = body?.error?.code ?? code;
        message = body?.error?.message ?? message;
      } catch {
        /* keep the generic message */
      }
      reject(new FileApiError(message, code, xhr.status));
    };
    xhr.onerror = () => reject(networkFailure());
    xhr.onabort = () => reject(new FileApiError("Upload canceled.", "aborted", 0));
    opts.register(() => xhr.abort());
    xhr.send(file);
  });
}
