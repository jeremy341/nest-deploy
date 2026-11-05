import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** The card's title and description lines, then whatever body you pass. */
function CardBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5">
      <SkeletonText size="title-2" width="w-40" />
      <SkeletonText size="body" width="w-full" className="mt-1" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** The create form: name, three permission rows, expiry and a button. */
function FormSkeleton() {
  return (
    <div className="space-y-4 rounded-md p-4 shadow-border-base" aria-hidden="true">
      <SkeletonText size="body" width="w-28" />
      <div>
        <SkeletonText size="label" width="w-14" className="mb-1.5" />
        <Skeleton className="h-9 w-full max-sm:h-10" />
      </div>
      <div>
        <SkeletonText size="label" width="w-24" className="mb-1.5" />
        <div className="hairline-y overflow-hidden rounded-md shadow-border-base">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-4 rounded-sm" />
              <SkeletonText size="body" width={skeletonWidth(i + 2)} className="min-w-0" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <SkeletonText size="label" width="w-24" className="mb-1.5" />
        <Skeleton className="h-9 w-48 max-sm:h-10 max-sm:w-full" />
      </div>
      <Skeleton className="h-8 w-32 max-sm:h-10 max-sm:w-full" />
    </div>
  );
}

/** The token list while it loads: a heading line and rows with a name, a prefix, chips and dates. */
export function TokenListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className="hairline-y overflow-hidden rounded-md shadow-border-base">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SkeletonText size="body" width={skeletonWidth(i)} />
                <SkeletonText size="label" width="w-24" />
              </div>
              <Skeleton className="h-7 w-16 max-sm:h-10" />
            </div>
            <div className="mt-2 flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-sm" />
              <Skeleton className="h-5 w-28 rounded-sm" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <SkeletonText key={j} size="label" width="w-28" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** /developer. The tokens card (form, list) and the agents card, as the real page lays them out. */
export function DeveloperSkeleton() {
  return (
    <LoadingRegion label="Loading developer settings…" className="mx-auto max-w-[760px]">
      <SkeletonPageHeader description />
      <div className="space-y-6">
        <SkeletonCard>
          <CardBody>
            <div className="space-y-6">
              <FormSkeleton />
              <div>
                <SkeletonText size="body" width="w-28" className="mb-2" />
                <TokenListSkeleton />
              </div>
            </div>
          </CardBody>
        </SkeletonCard>
        <SkeletonCard>
          <CardBody>
            <div className="space-y-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <SkeletonText size="body" width="w-40" />
                  <SkeletonText size="body" width="w-full" lines={2} />
                </div>
              ))}
              <Skeleton className="h-20 w-full" />
            </div>
          </CardBody>
        </SkeletonCard>
      </div>
    </LoadingRegion>
  );
}
