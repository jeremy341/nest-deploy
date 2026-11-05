import { FM_GRID } from "@/components/file-manager-format";
import {
  LoadingRegion,
  Skeleton,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const NAME_WIDTHS = ["w-40", "w-56", "w-32", "w-48", "w-64", "w-36", "w-44"];

/**
 * /projects/[slug]/files while it loads: header with its two buttons, the
 * path, then the folder table beside the (empty) preview pane. Uses the same
 * grid as the page.
 */
export function FilesSkeleton() {
  return (
    <LoadingRegion label="Loading files…" className="space-y-4">
      <SkeletonPageHeader description actions={2} className="mb-2" />

      <div aria-hidden="true" className="flex h-9 items-center gap-2">
        <SkeletonText size="body" width="w-16" />
        <SkeletonText size="body" width="w-12" />
      </div>

      <div className={FM_GRID}>
        <div className="min-w-0 overflow-hidden rounded-lg bg-card shadow-border-small">
          <div className="border-b px-4 py-2">
            <SkeletonText size="label" width="w-12" />
          </div>
          <div className="hairline-y">
            {NAME_WIDTHS.map((w, i) => (
              <div key={i} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <Skeleton className="size-5 shrink-0" />
                <Skeleton className={cn("h-4", w)} />
              </div>
            ))}
          </div>
          <div className="border-t px-4 py-2">
            <SkeletonText size="caption" width="w-14" />
          </div>
        </div>
        <div className="hidden rounded-lg bg-card p-4 shadow-border-small lg:block">
          <SkeletonText size="title-3" width="w-32" />
          <SkeletonText size="caption" width="w-48" className="mt-1" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
