import { cn } from "@/lib/utils";
import { WRAP } from "./_components/layout";
import { StatsHeader } from "./_components/stats-header";
import { StatsSkeleton } from "./_components/stats-skeleton";

/** The page's own shape: the real header, then the skeleton of the figures. */
export default function Loading() {
  return (
    <>
      <StatsHeader />
      <div className={cn(WRAP, "pb-20 lg:pb-28")}>
        <StatsSkeleton />
      </div>
    </>
  );
}
