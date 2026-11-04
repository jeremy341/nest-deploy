import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** Fixed bar heights (percent) so the server and client markup match. */
const BAR_HEIGHTS = [
  38, 52, 44, 61, 70, 48, 35, 56, 82, 64, 47, 40, 58, 73, 90, 66, 51, 43, 60, 77, 55, 46, 39, 62,
  68, 84, 59, 50, 42, 71,
];

/** /projects/[slug]/analytics. Stats, daily chart, two top lists and the setup card. */
export function AnalyticsSkeleton() {
  return (
    <LoadingRegion label="Loading analytics…" className="space-y-6">
      <SkeletonPageHeader description />

      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <SkeletonCard key={i} className="p-4">
            <SkeletonText size="label" width="w-20" />
            <div className="mt-1 flex h-10 items-center">
              <Skeleton className="h-8 w-24" />
            </div>
          </SkeletonCard>
        ))}
      </div>

      <SkeletonCard className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonText size="body" width="w-36" />
          <SkeletonText size="caption" width="w-28" />
        </div>
        <div className="flex h-32 items-end gap-[3px]">
          {BAR_HEIGHTS.map((h, i) => (
            <Skeleton
              key={i}
              className="min-w-0 flex-1 rounded-none"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between">
          <SkeletonText size="caption" width="w-12" />
          <SkeletonText size="caption" width="w-12" />
        </div>
      </SkeletonCard>

      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((c) => (
          <SkeletonCard key={c} header>
            <div className="hairline-y">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonRow key={i} className="min-h-0 justify-between py-2.5">
                  <SkeletonText size="body" width={skeletonWidth(i + c)} className="min-w-0" />
                  <SkeletonText size="body" width="w-8" />
                </SkeletonRow>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>

      <SkeletonCard className="p-5">
        <SkeletonText size="title-2" width="w-40" />
        <SkeletonText size="body" width="w-full" lines={2} className="mt-1" />
        <div className="mt-4 space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonText key={i} size="label" width={i === 0 ? "w-96" : i === 3 ? "w-48" : "w-80"} />
          ))}
        </div>
        <Skeleton className="mt-4 h-8 w-36 max-sm:h-10" />
      </SkeletonCard>
    </LoadingRegion>
  );
}
