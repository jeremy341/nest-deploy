"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const RELEASES = [
  { id: "4be19c0", note: "Fix typo on the about page" },
  { id: "9d02a7e", note: "Add dark mode toggle" },
  { id: "c61f3b8", note: "Speed up the leaderboard query" },
  { id: "1a5ddab", note: "Switch to the new logo" },
  { id: "e7730f2", note: "Add pagination to /recipes" },
  { id: "30bb8d1", note: "Bump dependencies" },
  { id: "a92c64d", note: "Redesign the footer" },
  { id: "5f0e1c3", note: "Handle empty search results" },
];

/** Pick any earlier release and it becomes the live one. Sample data. */
export function ReleaseStrip() {
  const [live, setLive] = useState(RELEASES.length - 1);
  const [flash, setFlash] = useState(0);

  return (
    <div>
      <div role="group" aria-label="Releases, oldest to newest" className="flex flex-wrap gap-1.5">
        {RELEASES.map((r, i) => {
          const isLive = i === live;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={isLive}
              aria-label={`Release ${r.id}: ${r.note}${isLive ? " (live)" : ""}`}
              onClick={() => {
                if (i === live) return;
                setLive(i);
                setFlash((n) => n + 1);
              }}
              className={cn(
                "ease-out-strong relative size-9 outline-none transition-[background-color,transform] duration-200 active:scale-[0.94]",
                isLive
                  ? "bg-brand"
                  : "bg-[var(--ds-gray-200)] hover:bg-[color-mix(in_oklab,var(--brand)_40%,var(--ds-gray-200))]"
              )}
            >
              {isLive ? (
                <span
                  key={flash}
                  aria-hidden="true"
                  className="absolute -inset-1 border-2 border-brand"
                  style={{ animation: flash > 0 ? "chip-out 600ms ease-out forwards" : undefined }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-4 min-h-10 text-[15px]" aria-live="polite">
        <span className="font-mono text-[13px] text-brand-text">{RELEASES[live].id}</span>
        <span className="mx-2 text-muted-foreground">is live</span>
        <span className="text-muted-foreground">{RELEASES[live].note}</span>
      </p>
    </div>
  );
}
