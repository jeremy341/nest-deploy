"use client";

import { useId, useState } from "react";
import { CaretRightIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import type { BuildLine, DeployState } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** Collapsible build output with a find box. Sample lines, not real output. */
export function BuildLogs({
  lines,
  state,
  duration,
}: {
  lines: BuildLine[];
  state: DeployState;
  duration: string;
}) {
  const [open, setOpen] = useState(state === "error");
  const [query, setQuery] = useState("");
  const panelId = useId();

  const q = query.trim().toLowerCase();
  const visible = q
    ? lines.filter((l) => l.text.toLowerCase().includes(q))
    : lines;

  return (
    <section className="rounded-lg bg-card shadow-border-small">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium tracking-[-0.02em]"
      >
        <CaretRightIcon
          className={cn("size-4 transition-transform", open && "rotate-90")}
        />
        Build Logs
        <span className="ml-auto flex items-center gap-2 font-normal text-muted-foreground">
          {duration}
          {state === "error" ? (
            <XCircleIcon
              weight="fill"
              className="size-5 text-[var(--status-error)]"
              aria-label="Build failed"
            />
          ) : (
            <CheckCircleIcon
              weight="fill"
              className="size-5 text-[var(--ds-blue-700)]"
              aria-label="Build succeeded"
            />
          )}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="border-t">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <p className="text-[13px] text-muted-foreground">
              {lines.length} lines
            </p>
            <Input
              type="search"
              aria-label="Find in logs"
              placeholder="Find in logs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 max-w-56"
            />
          </div>
          <div
            role="log"
            aria-label="Build output"
            tabIndex={0}
            className="max-h-[420px] overflow-auto px-4 pb-4 font-mono text-[13px] leading-5"
          >
            {visible.length === 0 ? (
              <p className="py-6 text-center font-sans text-muted-foreground">
                No lines match “{query}”.
              </p>
            ) : (
              visible.map((l, i) => (
                <p key={i} className="flex gap-4 whitespace-pre-wrap">
                  <span className="tabular shrink-0 text-subtle-foreground">
                    {l.time}
                  </span>
                  <span
                    className={cn(
                      l.tone === "error" && "text-[var(--status-error)]",
                      l.tone === "warn" && "text-warning"
                    )}
                  >
                    {l.text}
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
