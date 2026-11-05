import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** A group card: title and description, then rows the height of the real ones. */
function GroupSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonCard>
      <div className="border-b px-4 py-3">
        <SkeletonText size="title-3" width="w-28" />
        <SkeletonText size="label" width="w-72" className="mt-0.5" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-[61px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0">
              <SkeletonText size="body" width={skeletonWidth(i)} />
              <SkeletonText size="label" width="w-44" />
            </div>
            <SkeletonText size="body" width="w-32" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

/** The page below the header: the disk card, then Projects, Orphans and Other ports. */
export function ContainerBodySkeleton({ label = "Reading the container…" }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="space-y-6">
      <SkeletonCard>
        <div className="px-4 pt-3">
          <SkeletonText size="title-3" width="w-48" />
          <SkeletonText size="label" width="w-56" />
        </div>
        <div className="px-4 pt-3 pb-4">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <SkeletonText size="label" width="w-64" className="mt-2" />
        </div>
      </SkeletonCard>
      <GroupSkeleton rows={2} />
      <GroupSkeleton rows={2} />
      <GroupSkeleton rows={3} />
    </LoadingRegion>
  );
}

/** /container: header with the refresh button, then the body. */
export function ContainerSkeleton() {
  return (
    <div>
      <SkeletonPageHeader description actions={1} />
      <ContainerBodySkeleton label="Reading the container…" />
    </div>
  );
}
