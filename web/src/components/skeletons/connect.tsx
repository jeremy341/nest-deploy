import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/ui/skeleton";

function StepSkeleton({ withInput }: { withInput?: boolean }) {
  return (
    <li className="flex gap-4">
      <Skeleton className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <SkeletonText size="body" width="w-40" />
        <div className="mt-2">
          {withInput ? (
            <>
              <Skeleton className="h-9 w-full max-sm:h-10" />
              <SkeletonText size="label" width="w-64" className="mt-1.5" />
            </>
          ) : (
            <SkeletonText size="body" width="w-full" />
          )}
        </div>
      </div>
    </li>
  );
}

/** /connect. Header, one server card, and the add-server steps. */
export function ConnectSkeleton() {
  return (
    <LoadingRegion label="Loading servers…" className="mx-auto w-full max-w-[720px] space-y-6">
      <SkeletonPageHeader description actions={1} />

      <SkeletonCard>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <SkeletonText size="title-2" width="w-56" />
            <SkeletonText size="body" width="w-28" className="mt-0.5" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-32 max-sm:h-10" />
            <Skeleton className="h-8 w-20 max-sm:h-10" />
            <Skeleton className="h-8 w-24 max-sm:h-10" />
          </div>
        </div>
      </SkeletonCard>

      <SkeletonCard className="p-5">
        <SkeletonText size="title-2" width="w-48" className="mb-4" />
        <ol className="space-y-5">
          <StepSkeleton withInput />
          <StepSkeleton />
          <StepSkeleton />
        </ol>
        <Skeleton className="mt-5 h-[72px] w-full rounded-lg" />
      </SkeletonCard>
    </LoadingRegion>
  );
}
