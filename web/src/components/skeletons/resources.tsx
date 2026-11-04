import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** One chart card: title and reading, the plot area, then the low / average / peak strip. */
function ChartSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div>
          <SkeletonText size="title-3" width="w-24" />
          <SkeletonText size="label" width="w-44" className="mt-0.5" />
        </div>
        <SkeletonText size="body" width="w-16" />
      </div>
      <div className="px-4 pt-4 pb-3">
        <Skeleton className="h-[120px] w-full" />
        <SkeletonText size="caption" width="w-full" className="mt-1.5" />
      </div>
      <div className="grid grid-cols-3 divide-x border-t">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1 px-2 py-2.5">
            <SkeletonText size="caption" width="w-10" />
            <SkeletonText size="body" width="w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** /resources: header, range tabs, three charts, then the by-project table. */
export function ResourcesSkeleton() {
  return (
    <LoadingRegion label="Loading resources…" className="space-y-6">
      <SkeletonPageHeader description />
      <Skeleton className="h-8 w-[232px] max-sm:h-10" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <ChartSkeleton key={i} />
        ))}
      </div>
      <SkeletonCard header>
        <div className="divide-y">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3">
              <SkeletonText size="body" width={skeletonWidth(i)} />
              <SkeletonText size="body" width="w-28" className="ml-auto" />
              <SkeletonText size="body" width="w-24" className="max-sm:hidden" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </LoadingRegion>
  );
}
