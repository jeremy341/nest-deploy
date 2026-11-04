import {
  LoadingRegion,
  SkeletonCard,
  SkeletonPageHeader,
} from "@/components/ui/skeleton";

/** Only for routes without their own skeleton: a header and one card. */
export function GenericSkeleton() {
  return (
    <LoadingRegion label="Loading…">
      <SkeletonPageHeader description />
      <SkeletonCard header className="h-64" />
    </LoadingRegion>
  );
}
