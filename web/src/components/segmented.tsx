"use client";

import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Hide the text and show only the icon. The label stays as the accessible name. */
  iconOnly?: boolean;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-[4px] px-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-4",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon}
            {option.iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}
