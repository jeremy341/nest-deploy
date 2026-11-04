import { cn } from "@/lib/utils";
import type { DeployState } from "@/lib/mock";

const META: Record<DeployState, { label: string; dot: string }> = {
  ready: { label: "Ready", dot: "bg-success" },
  building: { label: "Building", dot: "bg-warning animate-pulse" },
  error: { label: "Error", dot: "bg-destructive" },
  queued: { label: "Queued", dot: "bg-muted-foreground" },
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
      className={cn("inline-flex items-center gap-2 text-[13px]", className)}
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
