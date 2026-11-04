import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonRow,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** /new. Title, import list, then the URL form card. */
export function NewProjectSkeleton() {
  return (
    <LoadingRegion label="Loading…" className="mx-auto w-full max-w-[720px]">
      <Skeleton className="h-10 w-80 max-w-full" />
      <SkeletonText size="body" width="w-72" className="mt-2" />

      <SkeletonText size="title-2" width="w-48" className="mt-8" />
      <Skeleton className="mb-3 h-9 w-56 max-w-full max-sm:h-10" />
      <Skeleton className="mb-3 h-9 w-full max-sm:h-10" />
      <SkeletonCard>
        <div className="hairline-y">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i}>
              <SkeletonCircle size={20} />
              <SkeletonText size="body" width={skeletonWidth(i)} className="min-w-0 flex-1" />
              <Skeleton className="h-8 w-20 max-sm:h-10" />
            </SkeletonRow>
          ))}
        </div>
      </SkeletonCard>

      <SkeletonCard className="mt-6 p-5">
        <SkeletonText size="body" width="w-56" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-9 flex-1 max-sm:h-10" />
          <Skeleton className="h-8 w-20 max-sm:h-10" />
        </div>
      </SkeletonCard>
    </LoadingRegion>
  );
}
