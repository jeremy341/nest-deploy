import { Suspense } from "react";
import { ActivityView } from "@/components/activity-view";
import { PageHeader } from "@/components/page-header";
import { ActivityBodySkeleton } from "@/components/skeletons/activity";
import { requireUser } from "@/server/auth/current";
import { PAGE_SIZE, parseFilters } from "@/server/activity";
import { queryActivity } from "@/server/activity-query";

export const metadata = { title: "Activity" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ActivityPage({ searchParams }: Props) {
  return (
    <div className="motion-enter">
      <PageHeader
        title="Activity"
        description="Changes to your projects, domains and servers, newest first. Times are UTC."
      />
      <Suspense fallback={<ActivityBodySkeleton />}>
        <ActivityContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Filters come from the URL, so a filtered view can be bookmarked. The server applies them. */
async function ActivityContent({ searchParams }: Props) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const page = await queryActivity(user.id, filters, { limit: PAGE_SIZE, now: new Date() });
  return <ActivityView filters={filters} initial={page} />;
}
