import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonText,
} from "@/components/ui/skeleton";

const SENTENCE_WIDTHS = ["w-[62%]", "w-[48%]", "w-[70%]", "w-[54%]", "w-[40%]"] as const;
const META_WIDTHS = ["w-28", "w-36", "w-24", "w-32"] as const;

/** One entry: a 32px icon, a sentence and a meta line, and the details button. Same height as the real row (62px). */
function EntryRowSkeleton({ i }: { i: number }) {
  return (
    <SkeletonRow className="min-h-0 items-start">
      <Skeleton className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <SkeletonText size="body" width={SENTENCE_WIDTHS[i % SENTENCE_WIDTHS.length]} />
        <SkeletonText size="label" width={META_WIDTHS[i % META_WIDTHS.length]} className="mt-0.5" />
      </div>
      <Skeleton className="size-8 shrink-0 max-sm:size-10" />
    </SkeletonRow>
  );
}

function DayGroupSkeleton({ rows, first = 0 }: { rows: number; first?: number }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <SkeletonText size="label" width="w-16" />
        <SkeletonText size="label" width="w-4" />
      </div>
      <SkeletonCard>
        <div className="hairline-y">
          {Array.from({ length: rows }, (_, i) => (
            <EntryRowSkeleton key={i} i={first + i} />
          ))}
        </div>
      </SkeletonCard>
    </section>
  );
}

/** The filter bar, the count line and two days of entries. The same boxes as ActivityView. */
export function ActivityBodySkeleton() {
  return (
    <LoadingRegion label="Loading activity…">
      <div className="-mx-4 border-b px-4 py-3 lg:-mx-6 lg:px-6" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="order-1 h-9 basis-full max-sm:h-10 lg:max-w-sm lg:flex-1 lg:basis-64" />
          <Skeleton className="order-2 h-9 min-w-0 flex-1 max-sm:h-10 lg:w-52 lg:flex-none xl:hidden" />
          <div className="order-3 hidden w-full xl:block">
            <Skeleton className="h-8 w-[700px] max-w-full" />
          </div>
          <Skeleton className="order-2 h-9 min-w-0 flex-1 max-sm:h-10 lg:w-44 lg:flex-none" />
        </div>
      </div>
      <div className="mt-4 flex min-h-8 items-center">
        <SkeletonText size="label" width="w-40" />
      </div>
      <div className="mt-2 space-y-6">
        <DayGroupSkeleton rows={5} />
        <DayGroupSkeleton rows={3} first={5} />
      </div>
    </LoadingRegion>
  );
}

/** /activity as a whole: header plus body. */
export function ActivitySkeleton() {
  return (
    <div>
      <SkeletonPageHeader description />
      <ActivityBodySkeleton />
    </div>
  );
}
