import { cn } from "@/lib/utils";

/**
 * The top of every dashboard page: one h1, an optional description, optional
 * actions on the right. `leading` is a mark beside the title (a project's
 * pixel avatar). On phones the actions drop below the title.
 */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-title-1">{title}</h1>
          {description ? (
            <div className="mt-1 max-w-[64ch] text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
