import {
  LoadingRegion,
  Skeleton,
  SkeletonPageHeader,
} from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LINE_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-1/2", "w-3/4", "w-5/6"] as const;

/** /logs. Header, toolbar, then the log viewer frame with line bars. */
export function LogsSkeleton() {
  return (
    <LoadingRegion label="Loading logs…">
      <SkeletonPageHeader description />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Skeleton className="h-9 w-48 max-sm:h-10 max-sm:w-full" />
          <Skeleton className="h-9 max-w-80 flex-1 max-sm:h-10 max-sm:max-w-none max-sm:basis-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="ml-auto h-8 w-24 max-sm:h-10" />
        </div>
        <div className="h-[18px]" aria-hidden="true" />
        <div className="log-surface min-h-[320px] overflow-hidden rounded-lg py-3 shadow-border-small">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="flex h-5 items-center px-4">
              <Skeleton
                className={cn("h-3 max-w-full rounded-sm", LINE_WIDTHS[(i * 3) % LINE_WIDTHS.length])}
              />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
