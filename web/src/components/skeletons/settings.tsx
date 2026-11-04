import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonText,
} from "@/components/ui/skeleton";

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <SkeletonText size="label" width="w-24" className="mb-1.5" />
      <Skeleton className="h-9 w-full max-sm:h-10" />
    </div>
  );
}

/** A settings card: title, description, then the body you pass. */
function CardBody({
  descriptionLines = 1,
  children,
}: {
  descriptionLines?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <SkeletonText size="title-2" width="w-48" />
      <SkeletonText size="body" width="w-full" lines={descriptionLines} className="mt-1" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** A line or two of label-sized note text, then a button. The shape of the automation cards. */
function NoteAndButton({ buttonWidth = "w-32" }: { buttonWidth?: string }) {
  return (
    <>
      <SkeletonText size="body" width="w-40" />
      <SkeletonText size="label" width="w-full" lines={2} className="mt-3" />
      <Skeleton className={`mt-4 h-8 max-sm:h-10 ${buttonWidth}`} />
    </>
  );
}

/**
 * /projects/[slug]/settings. The two-column layout: section nav on lg+, then
 * the six cards (build and run, environment, hook, notifications, status page,
 * delete), in the order the page draws them.
 */
export function SettingsSkeleton() {
  return (
    <LoadingRegion label="Loading settings…" className="w-full max-w-[936px]">
      <SkeletonPageHeader />
      <div className="grid gap-10 lg:grid-cols-[176px_minmax(0,720px)]">
        <div className="hidden space-y-0.5 self-start lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-8 items-center px-3">
              <SkeletonText size="body" width={i % 2 ? "w-24" : "w-28"} />
            </div>
          ))}
        </div>

        <div className="min-w-0 space-y-6">
          <SkeletonCard footer>
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSkeleton />
                <FieldSkeleton />
                <FieldSkeleton className="sm:col-span-2" />
                <FieldSkeleton />
                <div className="flex h-10 items-center gap-2 self-end sm:h-9">
                  <Skeleton className="size-4" />
                  <SkeletonText size="body" width="w-36" />
                </div>
              </div>
            </CardBody>
          </SkeletonCard>

          <SkeletonCard>
            <CardBody descriptionLines={2}>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_130px_auto] sm:items-end">
                <FieldSkeleton />
                <FieldSkeleton />
                <FieldSkeleton />
                <Skeleton className="h-8 w-16 max-sm:h-10" />
              </div>
              <div className="hairline-y mt-4 overflow-hidden rounded-md shadow-border-base">
                {[0, 1, 2].map((i) => (
                  <SkeletonRow key={i} className="justify-between px-3 py-2.5">
                    <SkeletonText size="body" width="w-32" />
                    <SkeletonText size="label" width="w-20" />
                  </SkeletonRow>
                ))}
              </div>
            </CardBody>
          </SkeletonCard>

          <SkeletonCard>
            <CardBody descriptionLines={2}>
              <NoteAndButton />
            </CardBody>
          </SkeletonCard>

          <SkeletonCard>
            <CardBody descriptionLines={2}>
              <div className="grid gap-3 sm:grid-cols-[1fr_190px_auto] sm:items-end">
                <FieldSkeleton />
                <FieldSkeleton />
                <Skeleton className="h-8 w-16 max-sm:h-10" />
              </div>
            </CardBody>
          </SkeletonCard>

          <SkeletonCard>
            <CardBody descriptionLines={3}>
              <NoteAndButton buttonWidth="w-44" />
            </CardBody>
          </SkeletonCard>

          <SkeletonCard footer>
            <CardBody descriptionLines={2}>
              <div className="mb-3 flex h-10 items-center gap-2 sm:h-8">
                <Skeleton className="size-4" />
                <SkeletonText size="body" width="w-64" />
              </div>
              <SkeletonText size="label" width="w-40" className="mb-1.5" />
              <Skeleton className="h-9 w-full max-sm:h-10" />
            </CardBody>
          </SkeletonCard>
        </div>
      </div>
    </LoadingRegion>
  );
}
