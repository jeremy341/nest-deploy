import {
  LoadingRegion,
  Skeleton,
  SkeletonCircle,
  SkeletonPageHeader,
  SkeletonText,
  skeletonWidth,
} from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One row, same grid template as DeploymentRow. Two stacked lines on phones. */
function RowSkeleton({ index, showProject }: { index: number; showProject: boolean }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-3 md:items-center",
        showProject
          ? "md:grid-cols-[150px_minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]"
          : "md:grid-cols-[minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]"
      )}
    >
      {showProject ? (
        <div className="hidden min-w-0 md:block">
          <SkeletonText size="body" width="w-24" />
        </div>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
        <SkeletonText size="body" width={skeletonWidth(index)} className="min-w-0" />
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonCircle size={8} />
          <SkeletonText size="body" width="w-14" />
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:contents">
          <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
          <SkeletonText size="body" width="w-40" className="min-w-0 flex-1" />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <SkeletonText size="body" width="w-12" />
          <SkeletonCircle size={24} />
        </div>
      </div>
      <div className="hidden justify-self-end md:block">
        <Skeleton className="size-7" />
      </div>
    </li>
  );
}

/**
 * /deployments (showProject) and /projects/[slug]/deployments. Header, filter
 * control, then the list card.
 */
export function DeploymentsSkeleton({ showProject }: { showProject: boolean }) {
  const rows = showProject ? 8 : 6;
  return (
    <LoadingRegion label="Loading deployments…">
      <SkeletonPageHeader description />
      {/* Mirrors the toolbar: search and sort, the filters, then the result count. */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 min-w-[200px] flex-1 max-sm:h-10 max-sm:basis-full" />
          <Skeleton className="h-9 w-36 max-sm:h-10 max-sm:w-[calc(50%-0.25rem)]" />
          <Skeleton className="h-9 w-36 max-sm:h-10 max-sm:w-[calc(50%-0.25rem)]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-[300px] max-w-full max-sm:h-10" />
          <Skeleton className="h-8 w-[240px] max-w-full max-sm:h-10" />
          <Skeleton className="h-9 w-36 max-sm:h-10 max-sm:w-full" />
        </div>
        <div className="flex min-h-8 items-center">
          <SkeletonText size="label" width="w-32" />
        </div>
      </div>
      <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
        {Array.from({ length: rows }, (_, i) => (
          <RowSkeleton key={i} index={i} showProject={showProject} />
        ))}
      </ul>
    </LoadingRegion>
  );
}
