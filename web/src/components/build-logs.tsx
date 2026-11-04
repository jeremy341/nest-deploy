"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CaretRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { PixelLoader } from "@/components/ui/pixel-loader";
import { isActive } from "@/lib/status";
import { cn } from "@/lib/utils";

export type LogLine = {
  id: number;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

function clock(iso: string) {
  const d = new Date(iso);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * The deployment log. While the deployment is running it streams new lines
 * over server-sent events; when it finishes the page refreshes once to pick
 * up the final status.
 */
export function BuildLogs({
  deploymentId,
  initialLines,
  rawState,
  duration,
}: {
  deploymentId: string;
  initialLines: LogLine[];
  rawState: string;
  duration: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LogLine[]>(initialLines);
  const [open, setOpen] = useState(rawState !== "ready");
  const [query, setQuery] = useState("");
  const panelId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const active = isActive(rawState);

  useEffect(() => {
    if (!active) return;
    const last = initialLines.at(-1)?.id ?? 0;
    const es = new EventSource(`/api/deployments/${deploymentId}/stream?after=${last}`);
    es.addEventListener("log", (e) => {
      const line = JSON.parse((e as MessageEvent).data) as LogLine;
      setLines((prev) => (prev.some((p) => p.id === line.id) ? prev : [...prev, line]));
    });
    es.addEventListener("state", () => {
      es.close();
      router.refresh();
    });
    es.onerror = () => {
      // The stream ends when the deployment does; refresh to show the result.
      es.close();
      router.refresh();
    };
    return () => es.close();
  }, [active, deploymentId, initialLines, router]);

  // Keep the status badge above the log fresh while a deployment runs.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  const q = query.trim().toLowerCase();
  const visible = q ? lines.filter((l) => l.message.toLowerCase().includes(q)) : lines;

  return (
    <section className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2 px-4 text-left font-medium tracking-[-0.02em] focus-visible:outline-offset-[-2px]"
      >
        <CaretRightIcon
          aria-hidden="true"
          className={cn("size-4 transition-transform duration-(--dur-base) ease-snappy", open && "rotate-90")}
        />
        Build Logs
        <span className="ml-auto flex items-center gap-2 font-normal text-muted-foreground">
          <span className="tabular">{duration}</span>
          {active ? (
            <>
              <span className="inline-flex size-5 items-center justify-center text-[var(--status-building)]">
                <PixelLoader size="md" />
              </span>
              <span className="sr-only">Running</span>
            </>
          ) : rawState === "ready" ? (
            <CheckCircleIcon weight="fill" className="size-5 text-brand-text" aria-label="Succeeded" />
          ) : (
            <XCircleIcon weight="fill" className="size-5 text-[var(--status-error)]" aria-label="Failed" />
          )}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="border-t">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <p className="tabular text-label text-muted-foreground">{lines.length} lines</p>
            <Input
              type="search"
              aria-label="Find in logs"
              placeholder="Find in logs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 max-w-56 max-sm:h-10"
            />
          </div>
          <div
            ref={scroller}
            role="log"
            aria-label="Build output"
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="log-surface max-h-[480px] min-h-24 overflow-auto py-3 focus-visible:outline-offset-[-2px]"
          >
            {visible.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-4 py-6 text-center font-sans text-muted-foreground">
                {lines.length === 0 ? (
                  <>
                    {active ? <PixelLoader size="sm" /> : null}
                    Waiting for the first log line…
                  </>
                ) : (
                  `No lines match “${query}”.`
                )}
              </p>
            ) : (
              visible.map((l) => (
                <p key={l.id} className="log-line flex gap-4 whitespace-pre-wrap">
                  <span className="tabular shrink-0 text-subtle-foreground">{clock(l.at)}</span>
                  <span
                    className={cn(
                      "break-all",
                      l.level === "error" && "text-[var(--status-error)]",
                      l.level === "warn" && "text-warning"
                    )}
                  >
                    {l.message}
                  </span>
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
