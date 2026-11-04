import { cn } from "@/lib/utils";
import { usage } from "@/lib/mock";

export function UsageCard() {
  return (
    <section
      aria-labelledby="usage-heading"
      className="rounded-lg bg-card shadow-border-small"
    >
      <div className="border-b px-4 py-3">
        <h2 id="usage-heading" className="text-sm font-medium tracking-[-0.02em]">
          Container usage
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Default Nest limits
        </p>
      </div>
      <ul className="hairline-y">
        {usage.map((item) => {
          const ratio = item.used / item.total;
          const hot = ratio >= 0.8;
          return (
            <li key={item.label} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span>{item.label}</span>
                <span className="tabular font-mono text-[12px] text-muted-foreground">
                  {item.used} / {item.total} {item.unit}
                </span>
              </div>
              <div
                role="meter"
                aria-label={`${item.label} usage`}
                aria-valuemin={0}
                aria-valuemax={item.total}
                aria-valuenow={item.used}
                className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    hot ? "bg-warning" : "bg-foreground"
                  )}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
