import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDownRightIcon, ArrowUpRightIcon, EqualsIcon } from "@phosphor-icons/react/dist/ssr";
import { DIRECTION_WORDS, describeCount, formatDuration, type Direction } from "@/lib/stats-format";
import { cn } from "@/lib/utils";
import { getPublicStats } from "@/server/stats-cache";
import { Figure, FrameLabel, NotEnough, SectionHead, Total, Value } from "./_components/figures";
import { FRAME, GRID, SECTION, STACK, WRAP } from "./_components/layout";
import { RuntimeBar } from "./_components/runtime-bar";
import { StatsChart } from "./_components/stats-chart";
import { StatsHeader } from "./_components/stats-header";
import { HourStrip, WeekdayChart } from "./_components/stats-shape-charts";
import { StatsSkeleton } from "./_components/stats-skeleton";

export const metadata = {
  title: "Stats",
  description:
    "How Nest Deploy is being used, as rounded totals: sign-ups, deployments and how they end, build times, when the work happens and what it is made of. Nothing identifies a person or a project.",
};

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const DIRECTION_ICON: Record<Direction, typeof EqualsIcon> = {
  up: ArrowUpRightIcon,
  down: ArrowDownRightIcon,
  same: EqualsIcon,
};

async function StatsBody() {
  // Request time, not build time: the numbers come from the database.
  await connection();
  const s = await getPublicStats();
  const rate = s.successRate;
  const d = s.deployments;
  const growth = s.growth;
  const DirectionIcon = DIRECTION_ICON[growth.direction];
  const build = s.buildTime;
  const mon = s.monitoring;

  return (
    <>
      <section aria-labelledby="usage">
        <SectionHead id="usage" title="Usage">
          Who is signing up and how much is being deployed.
        </SectionHead>

        <div className={cn(GRID, "mt-8")}>
          <section aria-labelledby="deploys" className={FRAME}>
            <div className="p-5">
              <h3 id="deploys" className="text-label text-muted-foreground">
                Deployments in the last {s.windowDays} days
              </h3>
              <p className="mt-2 flex min-h-14 items-center">
                <Figure count={d.total} display />
              </p>
              <div className="mt-5">
                <StatsChart daily={d.daily} />
              </div>
            </div>
          </section>

          <section aria-labelledby="totals" className={FRAME}>
            <h3 id="totals" className="sr-only">
              Totals
            </h3>
            <dl className="hairline-y">
              <Total label="Accounts signed up" hint="All time">
                <Figure count={s.accounts} />
              </Total>
              <Total label="Servers connected" hint="Connected at the last check">
                <Figure count={s.serversConnected} />
              </Total>
              <Total label="Projects deployed" hint="With at least one successful deployment">
                <Figure count={s.projectsDeployed} />
              </Total>
              <Total label="Public status pages" hint="Projects with a status page switched on">
                <Figure count={s.statusPages} />
              </Total>
              <Total label="Domains mapped" hint="Custom domains whose DNS check passed">
                <Figure count={s.domainsMapped} />
              </Total>
            </dl>
          </section>
        </div>

        <div className={cn(GRID, "mt-6")}>
          <section aria-labelledby="growth" className={cn(FRAME, "p-5")}>
            <FrameLabel id="growth">New accounts in the last {growth.windowDays} days</FrameLabel>
            <p className="mt-1 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1">
              <Figure count={growth.last} />
              <span className="inline-flex items-center gap-1.5 text-title-2">
                <DirectionIcon aria-hidden="true" className="size-5 shrink-0" />
                {DIRECTION_WORDS[growth.direction]}
              </span>
            </p>
            <p className="mt-2 text-label text-muted-foreground">
              {growth.percentChange !== null
                ? `${growth.percentChange > 0 ? "+" : ""}${growth.percentChange}% compared with the ${growth.windowDays} days before, when ${describeCount(growth.previous)} accounts signed up.`
                : `Compared with the ${growth.windowDays} days before, when ${describeCount(growth.previous)} accounts signed up. A percentage is shown only when both weeks have at least ${growth.minimumForPercent} sign-ups.`}
            </p>
          </section>

          <section aria-labelledby="api" className={FRAME}>
            <h3 id="api" className="sr-only">
              API and agent use
            </h3>
            <dl className="hairline-y">
              <Total label="Access tokens active" hint="Not revoked and not expired">
                <Figure count={s.api.tokensActive} small />
              </Total>
              <Total label="Deployments through the API" hint={`Started by a token, last ${s.windowDays} days`}>
                <Figure count={s.api.deploymentsViaApi} small />
              </Total>
            </dl>
            <p className="border-t px-5 py-3 text-caption text-muted-foreground">
              The first is a count of access tokens, not of how much they are used. The second counts deployments that
              scripts and AI agents started with one.
            </p>
          </section>
        </div>
      </section>

      <section aria-labelledby="reliability" className={SECTION}>
        <SectionHead id="reliability" title="Reliability">
          How deployments end, how long they take, and whether the apps are up.
        </SectionHead>

        <div className={cn(GRID, "mt-8")}>
          <section aria-labelledby="outcomes" className={FRAME}>
            <h3 id="outcomes" className="px-5 pt-5 text-label text-muted-foreground">
              How deployments ended in the last {s.windowDays} days
            </h3>
            <dl className="mt-3 hairline-y border-t">
              <Total label="Ready" hint="Built and running">
                <Figure count={d.outcomes.ready} small />
              </Total>
              <Total label="Failed" hint="Ended with an error">
                <Figure count={d.outcomes.error} small />
              </Total>
              <Total label="Canceled" hint="Stopped before they finished">
                <Figure count={d.outcomes.canceled} small />
              </Total>
            </dl>
            <div className="border-t p-5">
              <FrameLabel>Share that succeeded</FrameLabel>
              <p className="mt-1 flex min-h-10 items-center">
                {rate.percent === null ? <NotEnough /> : <Value>{rate.percent}%</Value>}
              </p>
              <p className="mt-2 text-label text-muted-foreground">
                {rate.percent === null
                  ? `A percentage is shown once at least ${rate.minimumFinished} deployments have finished in the last ${s.windowDays} days (ready or failed).`
                  : `Of ${describeCount(rate.finished)} deployments that finished in the last ${s.windowDays} days, ready or failed. Canceled ones are not counted.`}
              </p>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="build" className={cn(FRAME, "p-5")}>
              <FrameLabel id="build">Build time, start to finish</FrameLabel>
              {build.medianSeconds === null || build.p90Seconds === null ? (
                <>
                  <p className="mt-1 flex min-h-10 items-center">
                    <NotEnough />
                  </p>
                  <p className="mt-2 text-label text-muted-foreground">
                    Times are shown once at least {build.minimumFinished} deployments have finished in the last{" "}
                    {s.windowDays} days.
                  </p>
                </>
              ) : (
                <>
                  <dl className="mt-1 grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-caption text-muted-foreground">Median</dt>
                      <dd className="flex min-h-10 items-center">
                        <Value>{formatDuration(build.medianSeconds)}</Value>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-muted-foreground">90th percentile</dt>
                      <dd className="flex min-h-10 items-center">
                        <Value>{formatDuration(build.p90Seconds)}</Value>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-label text-muted-foreground">
                    Half finished within the median, nine in ten within the 90th percentile. From{" "}
                    {describeCount(build.finished)} deployments that finished in the last {s.windowDays} days, in
                    whole seconds.
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="uptime" className={cn(FRAME, "p-5")}>
              <FrameLabel id="uptime">Apps that were up at their last check</FrameLabel>
              <p className="mt-1 flex min-h-10 items-center">
                {mon.upPercent === null ? <NotEnough /> : <Value>{mon.upPercent}%</Value>}
              </p>
              <p className="mt-2 text-label text-muted-foreground">
                {mon.upPercent === null
                  ? `A percentage is shown once at least ${mon.minimumChecked} projects have had an uptime check.`
                  : `Of ${describeCount(mon.checked)} projects with an uptime check. It is a snapshot of the latest check, not an average over time.`}
              </p>
            </section>
          </div>
        </div>
      </section>

      <section aria-labelledby="shape" className={SECTION}>
        <SectionHead id="shape" title="Shape of the work">
          When deployments happen and what they are made of.
        </SectionHead>

        <div className={STACK}>
          <div className={GRID}>
            <section aria-labelledby="weekday" className={FRAME}>
              <h3 id="weekday" className="sr-only">
                Deployments by weekday
              </h3>
              <div className="p-5">
                <WeekdayChart buckets={d.byWeekday} windowDays={s.windowDays} />
                <p className="mt-3 text-caption text-muted-foreground">
                  The same {s.windowDays} days, so some weekdays are counted five times and others four.
                </p>
              </div>
            </section>

            <section aria-labelledby="env" className={FRAME}>
              <h3 id="env" className="px-5 pt-5 text-label text-muted-foreground">
                Deployments by environment, last {s.windowDays} days
              </h3>
              <dl className="mt-3 hairline-y border-t">
                <Total label="Production" hint="From the production branch">
                  <Figure count={d.byEnvironment.production} small />
                </Total>
                <Total label="Preview" hint="From any other branch or a pull request">
                  <Figure count={d.byEnvironment.preview} small />
                </Total>
              </dl>
            </section>
          </div>

          <div className={GRID}>
            <section aria-labelledby="hour" className={FRAME}>
              <h3 id="hour" className="sr-only">
                Deployments by hour of day
              </h3>
              <div className="p-5">
                <HourStrip buckets={d.byHour.buckets} minimumBucket={d.byHour.minimumBucket} windowDays={s.windowDays} />
              </div>
            </section>

            <section aria-labelledby="runtimes" className={FRAME}>
              <h3 id="runtimes" className="sr-only">
                Runtimes in use
              </h3>
              <div className="p-5">
                <RuntimeBar runtimes={s.runtimes} />
              </div>
            </section>
          </div>
        </div>
      </section>

      <section aria-labelledby="about" className="mt-14 max-w-[640px] lg:mt-20">
        <h2 id="about" className="text-title-3">
          About these numbers
        </h2>
        <div className="mt-3 space-y-3 text-body-lg text-reading">
          <p>
            Counts are rounded. Nothing here identifies a person or a project. Anything under 10 is shown as
            &ldquo;fewer than 10&rdquo;, and larger numbers keep two significant figures. Each bar, hour and weekday
            follows the same rule, so none of them can point at one person.
          </p>
          <p>
            A percentage always says what it is a share of, and it appears only when at least 50 items sit behind it.
            Below that it reads &ldquo;Not enough data&rdquo;.
          </p>
          <p>
            They are totals from this Nest Deploy installation, with days and hours counted in UTC. They say how much
            it is used. They are not a measure of uptime, and they say nothing about how any one app is running.
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
