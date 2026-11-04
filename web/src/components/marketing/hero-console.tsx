"use client";

import { useState } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";

const LINES: { t: string; text: string; emph?: boolean }[] = [
  { t: "14:02:11", text: "Cloning github.com/sam-r/hello-world (branch main)" },
  { t: "14:02:12", text: "Commit 7fd1a60: Add the dark mode toggle" },
  { t: "14:02:13", text: "Building: pnpm build" },
  { t: "14:02:27", text: "Packed release: 4.1 MB" },
  { t: "14:02:28", text: "Connecting to your Nest container" },
  { t: "14:02:30", text: "Checksum verified" },
  { t: "14:02:31", text: "Switched to release 1a5ddab2 and restarted" },
  { t: "14:02:33", text: "Healthy: HTTP 200 on port 3000" },
  { t: "14:02:33", text: "Live on port 3000.", emph: true },
];

const STEP = 430; // ms between lines
const START = 700;

/**
 * A deployment that plays itself. The motion is CSS only, so it never blocks
 * the main thread and simply shows the finished state with reduced motion.
 * Everything in it is sample data and the caption says so.
 */
export function HeroConsole() {
  const [run, setRun] = useState(0);
  const doneAt = START + LINES.length * STEP;

  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-xl bg-[var(--ds-background-100)] shadow-modal">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium tracking-[-0.02em]">hello-world</p>
            <p className="truncate text-[13px] text-muted-foreground">
              Production · main · 7fd1a60
            </p>
          </div>

          <div className="relative h-6 w-24 shrink-0 text-[13px] font-medium" aria-live="polite">
            <span
              key={`b${run}`}
              data-chip="building"
              className="console-chip absolute inset-y-0 right-0 flex items-center gap-2 whitespace-nowrap"
              style={{ animation: `chip-out 300ms ease-out ${doneAt}ms forwards` }}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-[var(--status-building)]"
                style={{ animation: "pulse-dot 1.1s ease-in-out infinite" }}
              />
              Building
            </span>
            <span
              key={`r${run}`}
              className="console-chip absolute inset-y-0 right-0 flex items-center gap-2 whitespace-nowrap opacity-0"
              style={{ animation: `chip-in 320ms cubic-bezier(0.23,1,0.32,1) ${doneAt + 120}ms forwards` }}
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-ready" />
              Ready
            </span>
          </div>
        </div>

        <div
          key={run}
          role="log"
          aria-label="Sample deployment log"
          className="min-h-[286px] space-y-1.5 px-4 py-4 font-mono text-[13px] leading-5"
        >
          {LINES.map((l, i) => (
            <p
              key={i}
              className="console-line flex gap-3 opacity-0"
              style={{ animation: `console-line-in 450ms cubic-bezier(0.23,1,0.32,1) ${START + i * STEP}ms forwards` }}
            >
              <span className="tabular shrink-0 text-subtle-foreground">{l.t}</span>
              <span className={l.emph ? "font-medium text-brand-text" : undefined}>{l.text}</span>
            </p>
          ))}
        </div>
      </div>

      <figcaption className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span>Sample deployment, not real data.</span>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium tracking-[-0.02em] transition-colors hover:bg-[var(--ds-gray-100)] hover:text-foreground active:scale-[0.97]"
        >
          <ArrowCounterClockwiseIcon className="size-4" />
          Replay
        </button>
      </figcaption>
    </figure>
  );
}
