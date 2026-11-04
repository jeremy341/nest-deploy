import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

function Field() {
  return (
    <div className="min-w-0">
      <SkeletonText size="label" width="w-16" className="mb-1" />
      <SkeletonText size="body" width="w-32" />
    </div>
  );
}

/** /projects/[slug]. Page header, production, service, resources, two small cards, branches. */
export function ProjectOverviewSkeleton() {
  return (
    <LoadingRegion label="Loading project…" className="space-y-6">
      <SkeletonPageHeader leading description actions={4} />

      <SkeletonCard header footer>
        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field />
          <Field />
          <Field />
          <Field />
          <div className="min-w-0 sm:col-span-2">
            <SkeletonText size="label" width="w-16" className="mb-1" />
            <SkeletonText size="body" width="w-40" />
            <SkeletonText size="body" width="w-56" className="mt-1" />
          </div>
        </dl>
        <div className="flex h-[45px] items-center border-t px-4">
          <SkeletonText size="body" width="w-36" />
        </div>
      </SkeletonCard>

      <SkeletonCard>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <SkeletonText size="title-3" width="w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Field key={i} />
          ))}
        </div>
      </SkeletonCard>

      <SkeletonCard>
        <div className="border-b px-4 py-3">
          <SkeletonText size="title-3" width="w-32" />
          <SkeletonText size="label" width="w-40" className="mt-0.5" />
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i}>
              <SkeletonText size="label" width="w-20" className="mb-1" />
              <Skeleton className="h-7 w-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <SkeletonCard key={i} className="p-4">
            <SkeletonText size="title-3" width="w-24" className="mb-3" />
            <SkeletonText size="body" width="w-48" lines={3} />
          </SkeletonCard>
        ))}
      </div>

      <div>
        <SkeletonText size="title-2" width="w-40" className="mb-3" />
        <SkeletonCard>
          <div className="hairline-y">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} className="min-h-0">
                <Skeleton className="size-4 shrink-0" />
                <SkeletonText size="body" width={skeletonWidth(i)} className="min-w-0 flex-1" />
                <Skeleton className="h-3 w-12" />
              </SkeletonRow>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </LoadingRegion>
  );
}
