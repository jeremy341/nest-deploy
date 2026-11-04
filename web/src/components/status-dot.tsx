import { cn } from "@/lib/utils";
import type { DeployState } from "@/lib/mock";

const META: Record<DeployState, { label: string; dot: string }> = {
  ready: { label: "Ready", dot: "bg-ready" },
  building: {
    label: "Building",
    dot: "bg-[var(--status-building)] animate-pulse",
  },
  error: { label: "Error", dot: "bg-[var(--status-error)]" },
  queued: { label: "Queued", dot: "bg-subtle-foreground" },
};

export function StatusDot({
  state,
  showLabel = true,
  className,
}: {
  state: DeployState;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-medium tracking-[-0.02em]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", meta.dot)}
      />
      {showLabel ? (
        <span>{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}
