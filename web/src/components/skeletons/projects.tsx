import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** One project card: avatar block, two text lines, status dot, commit line, footer line. */
function ProjectCardSkeleton() {
  return (
    <li className="min-w-0">
      <SkeletonCard className="h-full">
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonText size="body" width="w-32" />
              <SkeletonText size="label" width="w-40" />
            </div>
            <SkeletonCircle size={8} />
          </div>
          <SkeletonText size="body" width="w-56" />
          <SkeletonText size="label" width="w-40" className="mt-auto" />
        </div>
      </SkeletonCard>
    </li>
  );
}

/** Container usage: header with a label line and link, then three stacked meters. */
function UsageSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <SkeletonText size="title-3" width="w-32" />
          <SkeletonText size="label" width="w-40" className="mt-0.5" />
        </div>
        <SkeletonText size="label" width="w-20" />
      </div>
      <div className="hairline-y">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <SkeletonText size="body" width="w-16" />
              <SkeletonText size="title-2" width="w-12" />
            </div>
            <Skeleton className="mt-2 h-2 w-full rounded-sm" />
            <SkeletonText size="label" width="w-24" className="mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The slim "Recent deployments" rail: a header, a few two-line rows, a footer link. */
function RecentSkeleton() {
  return (
    <SkeletonCard header footer>
      <div className="hairline-y">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="px-4 py-3">
            <SkeletonText size="body" width={skeletonWidth(i)} />
            <SkeletonText size="body" width="w-48" className="mt-0.5" />
            <SkeletonText size="label" width="w-32" className="mt-1" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/** /projects. A one-line fact, the projects, and a rail of usage and recent deployments. */
export function ProjectsSkeleton() {
  return (
    <LoadingRegion label="Loading projects…" className="space-y-6">
      <div className="flex h-6 items-center gap-3">
        <Skeleton className="h-2 w-16 rounded-sm" />
        <Skeleton className="h-4 w-56 max-w-full rounded-sm" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 min-w-[200px] flex-1 max-sm:h-10" />
            <Skeleton className="h-8 w-[66px] max-sm:h-10" />
            <Skeleton className="h-9 w-[104px] max-sm:h-10" />
          </div>
          <div className="@container">
            <ul className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </ul>
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          <UsageSkeleton />
          <RecentSkeleton />
        </div>
      </div>
    </LoadingRegion>
  );
}
