import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";

/** A card in the settings style: title, description lines, then the body you pass. */
function CardBody({
  descriptionLines = 1,
  children,
}: {
  descriptionLines?: number
  children: React.ReactNode
}) {
  return (
    <div className="p-5">
      <SkeletonText size="title-2" width="w-40" />
      <SkeletonText size="body" width="w-full" lines={descriptionLines} className="mt-1" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Rows with one line of text each (profile fields, GitHub installations). */
function SimpleList({ rows }: { rows: number }) {
  return (
    <div className="hairline-y overflow-hidden rounded-md shadow-border-base">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <SkeletonText size="body" width={skeletonWidth(i + 1)} className="min-w-0" />
        </div>
      ))}
    </div>
  );
}

/** Signed-in browsers: a name line, a label line and a Sign out button. */
function SessionList({ rows }: { rows: number }) {
  return (
    <div className="hairline-y overflow-hidden rounded-md shadow-border-base">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <SkeletonText size="body" width={skeletonWidth(i)} />
            <SkeletonText size="label" width="w-24" />
          </div>
          {i > 0 ? <Skeleton className="h-7 w-16 max-sm:h-10" /> : null}
        </div>
      ))}
    </div>
  );
}

/** /account. Profile, GitHub, signed-in browsers and delete cards, as the real page lays them out. */
export function AccountSkeleton() {
  return (
    <LoadingRegion label="Loading account…" className="mx-auto max-w-[720px]">
      <SkeletonPageHeader description />
      <div className="space-y-6">
        <SkeletonCard>
          <CardBody>
            <SimpleList rows={2} />
          </CardBody>
        </SkeletonCard>
        <SkeletonCard>
          <CardBody>
            <SimpleList rows={1} />
          </CardBody>
        </SkeletonCard>
        <SkeletonCard>
          <CardBody>
            <SessionList rows={2} />
            <Skeleton className="mt-4 h-8 w-48 max-sm:h-10" />
          </CardBody>
        </SkeletonCard>
        <SkeletonCard footer>
          <CardBody descriptionLines={3}>
            <SkeletonText size="label" width="w-40" className="mb-1.5" />
            <Skeleton className="h-9 w-full max-sm:h-10" />
          </CardBody>
        </SkeletonCard>
      </div>
    </LoadingRegion>
  );
}
