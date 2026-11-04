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

  return (
    <div>
      <div role="group" aria-label="Releases, oldest to newest" className="flex gap-1.5">
        {RELEASES.map((r, i) => {
          const isLive = i === live;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={isLive}
              aria-label={`Release ${r.id}: ${r.note}${isLive ? " (live)" : ""}`}
              onClick={() => setLive(i)}
              className={cn(
                "ease-out-strong h-12 flex-1 transition-[background-color,transform] duration-200 active:scale-[0.94]",
                isLive
                  ? "-translate-y-1.5 bg-brand"
                  : "bg-foreground/15 hover:bg-foreground/30"
              )}
            />
          );
        })}
      </div>
      <p className="mt-4 text-[15px]" aria-live="polite">
        <span className="font-mono text-[13px] font-medium">{RELEASES[live].id}</span>
        <span className="mx-2 text-muted-foreground">is live:</span>
        <span>{RELEASES[live].note}</span>
      </p>
    </div>
  );
}
