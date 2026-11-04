import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/ui/skeleton";

/** /domains. Header, add form card, then three domain rows. */
export function DomainsSkeleton() {
  return (
    <LoadingRegion label="Loading domains…">
      <SkeletonPageHeader description />
      <div className="space-y-6">
        <SkeletonCard footer>
          <div className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_130px]">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <SkeletonText size="label" width="w-20" className="mb-1.5" />
                <Skeleton className="h-9 w-full max-sm:h-10" />
              </div>
            ))}
          </div>
        </SkeletonCard>

        <SkeletonCard>
          <div className="hairline-y">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <SkeletonText size="body" width="w-48" />
                  <SkeletonText size="label" width="w-24" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <SkeletonCircle size={8} />
                    <SkeletonText size="label" width="w-16" />
                  </div>
                  <Skeleton className="h-7 w-16 max-sm:h-10" />
                  <Skeleton className="size-7 max-sm:size-10" />
                  <Skeleton className="size-7 max-sm:size-10" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </LoadingRegion>
  );
}
