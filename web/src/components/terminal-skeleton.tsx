import { LoadingRegion, Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

/** Same frame as the open card, so the page does not move when the check finishes. */
export function IdleSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-lg bg-card shadow-border-small">
      <div className="p-5">
        <div className="flex h-7 items-center">
          <Skeleton className="h-[66%] w-72 max-w-full rounded-sm" />
        </div>
        <div className="mt-1 space-y-0">
          <div className="flex h-5 items-center">
            <Skeleton className="h-[66%] w-full max-w-[62ch] rounded-sm" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-[66%] w-4/5 max-w-[50ch] rounded-sm" />
          </div>
        </div>
        <div className="mt-4 space-y-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-5 items-center">
              <Skeleton className="h-[66%] w-3/5 max-w-[48ch] rounded-sm" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-b-lg border-t bg-background-subtle px-5 py-3">
        <Skeleton className="h-10 w-36" />
      </div>
    </div>
  );
}

/** /projects/[slug]/terminal while the project loads: the header, then the open card. */
export function TerminalSkeleton() {
  return (
    <LoadingRegion label="Loading terminal…">
      <SkeletonPageHeader description />
      <IdleSkeleton />
    </LoadingRegion>
  );
}
