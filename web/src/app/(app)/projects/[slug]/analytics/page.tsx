import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr";
import { AnalyticsChart } from "@/components/analytics-chart";
import { AnalyticsSetup } from "@/components/analytics-setup";
import { Stagger } from "@/components/motion/stagger";
import { PageHeader } from "@/components/page-header";
import { DocsLink } from "@/components/settings-ui";
import { AnalyticsSkeleton } from "@/components/skeletons/analytics";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/current";
import { analyticsSummary, snippet } from "@/server/analytics";
import { projectViews } from "@/server/queries";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug} analytics` };
}

const number = new Intl.NumberFormat("en");

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-card p-4 shadow-border-small">
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-stat">{value}</p>
      {note ? <p className="mt-1 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function TopList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; views: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <h2 className="border-b px-4 py-3 text-title-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="hairline-y">
          {rows.map((r) => (
            <li
              key={r.label}
              className="relative flex items-center justify-between gap-4 px-4 py-2.5 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-[var(--ds-gray-100)]"
                style={{ width: `${(r.views / max) * 100}%` }}
              />
              <span className="relative min-w-0 truncate font-mono text-[13px]">{r.label}</span>
              <span className="tabular relative shrink-0 text-[13px] text-muted-foreground">
                {number.format(r.views)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();
  const summary = await analyticsSummary(user.id, project.id, 30);
  const on = Boolean(project.analyticsKey);

  return (
    <div className="motion-enter space-y-6">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Analytics"
        description={`Visits to ${project.name} over the last 30 days, counted by a script on your site.`}
        actions={<DocsLink href="/docs/analytics" topic="analytics" className="max-sm:hidden" />}
      />

      {summary.views === 0 ? (
        <EmptyState
          icon={<ChartLineUpIcon />}
          title={on ? "Nothing counted yet" : "Analytics is off"}
          description={
            on
              ? "Add the snippet below to your site, redeploy, and visit a page."
              : "Turn it on below to get a snippet for your site."
          }
          action={
            on ? undefined : (
              <Link href="#analytics-setup" className={cn(buttonVariants({ variant: "outline" }))}>
                Set up analytics
              </Link>
            )
          }
        />
      ) : (
        <>
          <Stagger as="div" className="grid gap-4 sm:grid-cols-2">
            <Stat label="Page views" value={number.format(summary.views)} />
            <Stat
              label="Visitors"
              value={number.format(summary.visitors)}
              note="Counted per day. Someone who visits on two days counts twice."
            />
          </Stagger>
          <AnalyticsChart daily={summary.daily} />
          <div className="grid gap-4 md:grid-cols-2">
            <TopList
              title="Top pages"
              rows={summary.pages.map((p) => ({ label: p.path, views: p.views }))}
              empty="No pages yet."
            />
            <TopList
              title="Where visitors came from"
              rows={summary.referrers.map((r) => ({ label: r.host, views: r.views }))}
              empty="Most visits had no referring site."
            />
          </div>
        </>
      )}

      <AnalyticsSetup
        projectId={project.id}
        initialSnippet={project.analyticsKey ? snippet(project.analyticsKey) : null}
      />
    </div>
  );
}

export default function ProjectAnalyticsPage({ params }: Props) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
