import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonText,
} from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LOG_WIDTHS = ["w-64", "w-96", "w-80", "w-72", "w-[28rem]", "w-56"] as const;

function Field() {
  return (
    <div className="min-w-0">
      <SkeletonText size="label" width="w-16" className="mb-1" />
      <SkeletonText size="body" width="w-32" />
    </div>
  );
}

/** /projects/[slug]/deployments/[id]. Header, details card, build logs card. */
export function DeploymentSkeleton() {
  return (
    <LoadingRegion label="Loading deployment…" className="space-y-6">
      <SkeletonPageHeader description actions={2} />

      <SkeletonCard header>
        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Field key={i} />
          ))}
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <SkeletonText size="label" width="w-16" className="mb-1" />
            <SkeletonText size="body" width="w-48" />
            <SkeletonText size="body" width="w-80" className="mt-1" />
          </div>
        </dl>
      </SkeletonCard>

      <SkeletonCard>
        <div className="flex h-12 items-center gap-3 px-4">
          <Skeleton className="size-4 shrink-0" />
          <SkeletonText size="body" width="w-24" />
          <SkeletonText size="body" width="w-12" className="ml-auto" />
        </div>
        <div className="flex h-10 items-center border-t px-4">
          <Skeleton className="h-8 w-48 max-w-full max-sm:h-10" />
        </div>
        <div className="border-t py-3">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex h-5 items-center px-4">
              <Skeleton className={cn("h-3 max-w-full rounded-sm", LOG_WIDTHS[i % LOG_WIDTHS.length])} />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </LoadingRegion>
  );
}
