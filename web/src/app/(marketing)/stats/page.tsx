import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { describeCount, formatCount, type Count } from "@/lib/stats-format";
import { cn } from "@/lib/utils";
import { getPublicStats } from "@/server/stats-cache";
import { FRAME, GRID, ROW, WRAP } from "./_components/layout";
import { StatsChart } from "./_components/stats-chart";
import { StatsHeader } from "./_components/stats-header";
import { StatsSkeleton } from "./_components/stats-skeleton";

export const metadata = {
  title: "Stats",
  description:
    "How Nest Deploy is being used, as rounded totals: accounts, connected servers, deployed projects and deployments over the last 30 days. Nothing identifies a person or a project.",
};

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** A rounded figure. A bound reads as words, in smaller type, so it is never mistaken for a count. */
function Figure({ count }: { count: Count }) {
  return "lessThan" in count ? (
    <span className="text-title-2">Fewer than {formatCount({ approx: count.lessThan })}</span>
  ) : (
    <span className="text-stat tabular">{formatCount(count)}</span>
  );
}

function Total({ label, hint, count }: { label: string; hint: string; count: Count }) {
  return (
    <div className={ROW}>
      <dt className="text-body font-medium">{label}</dt>
      <dd className="col-start-1 text-caption text-muted-foreground">{hint}</dd>
      <dd className="col-start-2 row-span-2 row-start-1 text-right">
        <Figure count={count} />
      </dd>
    </div>
  );
}

async function StatsBody() {
  // Request time, not build time: the numbers come from the database.
  await connection();
  const s = await getPublicStats();
  const rate = s.successRate;

  return (
    <>
      <div className={GRID}>
        <section aria-labelledby="deploys" className={FRAME}>
          <div className="p-5">
            <h2 id="deploys" className="text-label text-muted-foreground">
              Deployments in the last {s.windowDays} days
            </h2>
            <p className="mt-1 flex h-10 items-center">
              <Figure count={s.deployments.total} />
            </p>
            <div className="mt-5">
              <StatsChart daily={s.deployments.daily} />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="totals" className={FRAME}>
            <h2 id="totals" className="sr-only">
              Totals
            </h2>
            <dl className="hairline-y">
              <Total label="Accounts signed up" hint="All time" count={s.accounts} />
              <Total label="Servers connected" hint="Connected at the last check" count={s.serversConnected} />
              <Total label="Projects deployed" hint="With at least one successful deployment" count={s.projectsDeployed} />
              <Total label="Public status pages" hint="Projects with a status page switched on" count={s.statusPages} />
            </dl>
          </section>

          <section aria-labelledby="success" className={cn(FRAME, "p-5")}>
            <h2 id="success" className="text-label text-muted-foreground">
              Deployments that succeeded
            </h2>
            <p className="mt-1 flex min-h-10 items-center">
              {rate.percent === null ? (
                <span className="text-title-2">Not enough deployments yet</span>
              ) : (
                <span className="text-stat tabular">{rate.percent}%</span>
              )}
            </p>
            <p className="mt-2 text-label text-muted-foreground">
              {rate.percent === null
                ? `A percentage is shown once at least ${rate.minimumFinished} deployments have finished in the last ${s.windowDays} days.`
                : `Of ${describeCount(rate.finished)} deployments that finished in the last ${s.windowDays} days. Canceled ones are not counted.`}
            </p>
          </section>
        </div>
      </div>

      <section aria-labelledby="about" className="mt-12 max-w-[640px] lg:mt-16">
        <h2 id="about" className="text-title-3">
          About these numbers
        </h2>
        <div className="mt-3 space-y-3 text-body-lg text-reading">
          <p>
            Counts are rounded. Nothing here identifies a person or a project. Anything under 10 is shown as
            &ldquo;fewer than 10&rdquo;, and larger numbers keep two significant figures.
          </p>
          <p>
            They are totals from this Nest Deploy installation, with days counted in UTC. They say how much it is
            used. They are not a measure of uptime, and they say nothing about how any one app is running.
          </p>
        </div>
        <p className="mt-4 text-label text-muted-foreground">
          Last updated{" "}
          <time dateTime={s.generatedAt}>{updatedFormat.format(new Date(s.generatedAt))} UTC</time>. Refreshed at most
          every 5 minutes. The same numbers as{" "}
          <Link href="/api/stats" prefetch={false} className="link">
            JSON
          </Link>
          .
        </p>
      </section>
    </>
  );
}

export default function StatsPage() {
  return (
    <>
      <StatsHeader />
      <div className={cn(WRAP, "pb-20 lg:pb-28")}>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsBody />
        </Suspense>
      </div>
    </>
  );
}
