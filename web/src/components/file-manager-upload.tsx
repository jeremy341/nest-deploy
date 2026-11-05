"use client";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/components/file-manager-format";
import { cn } from "@/lib/utils";

export type UploadItem = {
  id: number;
  name: string;
  size: number;
  status: "waiting" | "uploading" | "done" | "error" | "skipped";
  /** 0 to 1. */
  progress: number;
  error?: string;
};

const STATUS_TEXT: Record<UploadItem["status"], string> = {
  waiting: "Waiting",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Failed",
  skipped: "Skipped",
};

/** Per-file progress for an upload batch. Hidden until something is queued. */
export function UploadPanel({
  items,
  onClear,
  onCancel,
}: {
  items: UploadItem[];
  onClear: () => void;
  onCancel: () => void;
}) {
  if (items.length === 0) return null;
  const active = items.some((i) => i.status === "waiting" || i.status === "uploading");
  const done = items.filter((i) => i.status === "done").length;

  return (
    <section aria-label="Uploads" className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-title-3">
          Uploads
          <span className="ml-2 font-normal text-muted-foreground">
            {done} of {items.length} done
          </span>
        </h2>
        {active ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel remaining
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ul className="hairline-y max-h-56 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-[13px]">{item.name}</span>
              <span
                className={cn(
                  "shrink-0 text-caption",
                  item.status === "error" ? "font-medium text-destructive" : "text-muted-foreground"
                )}
              >
                {item.status === "uploading"
                  ? `${Math.round(item.progress * 100)}%`
                  : STATUS_TEXT[item.status]}
                <span className="sr-only">, {formatBytes(item.size)}</span>
              </span>
            </div>
            {item.status === "uploading" || item.status === "waiting" ? (
              <div
                role="progressbar"
                aria-label={`Uploading ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.progress * 100)}
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--ds-gray-alpha-200)]"
              >
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-(--dur-fast)"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            ) : null}
            {item.status === "error" && item.error ? (
              <p className="mt-1 text-caption text-muted-foreground">{item.error}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
