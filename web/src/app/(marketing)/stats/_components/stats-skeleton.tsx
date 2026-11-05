import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FRAME, GRID, PLOT_H, ROW } from "./layout";

/** Fixed, not random: server and client must agree. */
const BARS = [30, 42, 24, 56, 48, 36, 62, 44, 28, 70, 52, 40, 66, 34, 58, 46, 26, 60, 50, 38, 72, 54, 32, 64, 44, 30, 56, 48, 40, 68];

/** Same frames, rows and bar area as the page, so nothing moves when the figures arrive. */
export function StatsSkeleton() {
  return (
    <LoadingRegion label="Loading stats…">
      <div className={GRID} aria-hidden="true">
        <div className={FRAME}>
          <div className="p-5">
            <SkeletonText size="label" width="w-48" />
            <div className="mt-1 flex h-10 items-center">
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3">
                <SkeletonText size="label" width="w-36" />
                <SkeletonText size="caption" width="w-28" />
              </div>
              <div className="mt-3 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                <div className={cn("flex flex-col justify-between", PLOT_H)}>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3 self-end" />
                </div>
                <div className={cn("flex items-end gap-[2px] border-b sm:gap-[3px]", PLOT_H)}>
                  {BARS.map((h, i) => (
                    <Skeleton key={i} className="min-w-0 flex-1 rounded-none" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div />
                <div className="mt-2 flex h-4 justify-between">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="mt-4 border-t pt-3">
                <div className="flex h-10 items-center sm:h-[34px]">
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className={cn(FRAME, "hairline-y")}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={ROW}>
                <SkeletonText size="body" width={i % 2 ? "w-36" : "w-44"} />
                <div className="row-span-2 row-start-1 col-start-2 flex justify-end">
                  <Skeleton className="h-7 w-28" />
                </div>
                <SkeletonText size="caption" width="w-48" className="col-start-1" />
              </div>
            ))}
          </div>
          <div className={cn(FRAME, "p-5")}>
            <SkeletonText size="label" width="w-40" />
            <div className="mt-1 flex min-h-10 items-center">
              <Skeleton className="h-8 w-20" />
            </div>
            <SkeletonText size="label" width="w-full" lines={2} className="mt-2" />
          </div>
        </div>
      </div>

      <div className="mt-12 max-w-[640px] lg:mt-16" aria-hidden="true">
        <SkeletonText size="title-3" width="w-48" />
        <SkeletonText size="body" width="w-full" lines={5} className="mt-3" />
      </div>
    </LoadingRegion>
  );
}
