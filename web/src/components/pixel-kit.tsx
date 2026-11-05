import { cn } from "@/lib/utils";
import type { UiState } from "@/lib/status";

/**
 * The small pieces that carry the pixel identity inside the dashboard:
 * a strip of lit squares (one per project or deployment), a one-line fact for
 * the top of a page, and a segmented meter. All three are decorative on their
 * own; the words next to them say the same thing.
 */

export type PixelTone = "ready" | "building" | "error" | "warning" | "neutral" | "none";

const TONE_BG: Record<PixelTone, string> = {
  ready: "bg-ready",
  building: "bg-[var(--status-building)]",
  error: "bg-[var(--status-error)]",
  warning: "bg-warning",
  neutral: "bg-subtle-foreground",
  none: "bg-[var(--ds-gray-500)]",
};

/** A deployment state as a square colour. `null` is "never deployed". */
export function toneOf(state: UiState | null): PixelTone {
  switch (state) {
    case "ready":
      return "ready";
    case "building":
    case "queued":
      return "building";
    case "error":
      return "error";
    case "canceled":
      return "neutral";
    default:
      return "none";
  }
}

/** One 8px square per item, in a row that wraps. Capped so a long list stays a strip. */
export function PixelStrip({
  tones,
  max = 24,
  className,
}: {
  tones: PixelTone[];
  max?: number;
  className?: string;
}) {
  const shown = tones.slice(0, max);
  return (
    <span aria-hidden="true" className={cn("inline-flex flex-wrap items-center gap-[3px]", className)}>
      {shown.map((tone, i) => (
        <span key={i} className={cn("size-2 rounded-[1px]", TONE_BG[tone])} />
      ))}
    </span>
  );
}

/**
 * The first fact on a page, said in a sentence, with an optional strip of
 * squares in front of it. Lives in the PageHeader description slot.
 */
export function FactLine({
  tones,
  children,
  className,
}: {
  tones?: PixelTone[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {tones && tones.length > 0 ? <PixelStrip tones={tones} /> : null}
      <span className="tabular text-foreground">{children}</span>
    </span>
  );
}

/**
 * A meter made of squares. `ratio` is 0 to 1. At 80% and over the lit squares
 * turn amber, the same threshold the old bar used.
 */
export function PixelMeter({
  ratio,
  label,
  now,
  max,
  cells = 20,
  className,
}: {
  ratio: number;
  label: string;
  now: number;
  max: number;
  cells?: number;
  className?: string;
}) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const lit = clamped > 0 ? Math.max(1, Math.round(clamped * cells)) : 0;
  const hot = clamped >= 0.8;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className={cn("grid gap-[2px]", className)}
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "h-2 rounded-[1px]",
            i < lit ? (hot ? "bg-warning" : "bg-foreground") : "bg-[var(--ds-gray-300)]"
          )}
        />
      ))}
    </div>
  );
}
