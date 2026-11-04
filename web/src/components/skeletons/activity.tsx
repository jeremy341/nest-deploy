import {
  LoadingRegion,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  SkeletonText,
} from "@/components/ui/skeleton";

const TEXT_WIDTHS = ["w-[60%]", "w-[45%]", "w-[70%]", "w-[52%]", "w-[38%]"] as const;

/** /activity. Header, a day label, then a card of entries. */
export function ActivitySkeleton() {
  return (
    <LoadingRegion label="Loading activity…">
      <SkeletonPageHeader description />
      <SkeletonText size="label" width="w-16" className="mb-2" />
      <SkeletonCard>
        <div className="hairline-y">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} className="min-h-0 justify-between">
              <SkeletonText size="body" width={TEXT_WIDTHS[i % TEXT_WIDTHS.length]} className="min-w-0 flex-1" />
              <SkeletonText size="label" width="w-12" />
            </SkeletonRow>
          ))}
        </div>
      </SkeletonCard>
    </LoadingRegion>
  );
}
