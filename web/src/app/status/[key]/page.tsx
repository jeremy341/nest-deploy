import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NestMark } from "@/components/nest-mark";
import { StatusIndicator } from "@/components/status-dot";
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { pixel } from "@/lib/fonts";
import { timeAgo } from "@/lib/status";
import { publicStatus, type Incident, type StripDay } from "@/server/status-page";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ key: string }> };

// A status page is for whoever has the link, not for search engines.
export const metadata = {
  title: "Status",
  robots: { index: false, follow: false },
};

const HEADLINE = {
  up: { text: "Operational", detail: "The app is answering.", glyph: "bg-ready" },
  down: { text: "Not responding", detail: "The app has stopped answering.", glyph: "bg-[var(--status-error)]" },
  unknown: { text: "No data yet", detail: "Checks have not run for this app yet.", glyph: "bg-[var(--ds-gray-600)]" },
} as const;

const STRIP_TONE = {
  up: "bg-ready",
  partial: "bg-[var(--status-building)]",
  down: "bg-[var(--status-error)]",
  none: "bg-muted",
} as const;

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
}

function dayTitle(d: StripDay): string {
  const label = dayLabel(d.day);
  if (d.state === "none") return `${label}: no checks yet`;
  if (d.state === "up") return `${label}: answering all day`;
  if (d.state === "partial") return `${label}: not answering for ${d.downMinutes} min`;
  return `${label}: not answering for most of the day, ${d.downMinutes} min`;
}

/** The strip in words, for screen readers: counts of each kind of day. */
function stripSummary(days: StripDay[], windowDays: number): string {
  const count = (s: StripDay["state"]) => days.filter((d) => d.state === s).length;
  return `Last ${windowDays} days: ${count("up")} answering all day, ${count("partial")} with an outage, ${count("down")} mostly down.`;
}

function lasted(i: Incident): string {
  if (!i.to) return "ongoing";
  const m = Math.max(1, Math.round((i.to.getTime() - i.from.getTime()) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}

const column = "relative mx-auto w-full max-w-[640px] px-4 py-16";

async function Content({ params }: Props) {
  await connection();
  const { key } = await params;
  const status = await publicStatus(key);
  if (!status) notFound();
  const head = HEADLINE[status.state];

  return (
    <div className={cn(column, "motion-enter")}>
      <h1 className="text-title-1">{status.name}</h1>

      <section aria-labelledby="now" className="mt-8 rounded-lg bg-card p-6 shadow-border-small">
        <h2 id="now" className="sr-only">
          Current status
        </h2>
        <p className="font-pixel flex items-center gap-3 text-[32px] leading-9 font-medium">
          <span aria-hidden="true" className={cn("size-3 shrink-0", head.glyph)} />
          {head.text}
        </p>
        <p className="mt-2 text-muted-foreground">
          {head.detail}
          {status.since && status.state !== "unknown" ? ` Since ${timeAgo(status.since)}.` : ""}
        </p>
        {status.uptime !== null ? (
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 border-t pt-4 text-label text-muted-foreground">
            <span className="text-stat tabular text-foreground">
              {status.uptime >= 99.995 ? "100" : status.uptime.toFixed(2)}%
            </span>
            <span>answering over the last {status.windowDays} days, from checks every few minutes.</span>
          </p>
        ) : null}
        {status.uptime !== null && status.days.length > 0 ? (
          <div className="mt-4">
            <div role="img" aria-label={stripSummary(status.days, status.windowDays)} className="flex h-6 gap-[3px]">
              {status.days.map((d) => (
                <span key={d.day} title={dayTitle(d)} className={cn("min-w-0 flex-1", STRIP_TONE[d.state])} />
              ))}
            </div>
            <div className="tabular mt-2 flex justify-between text-caption text-muted-foreground">
              <span>{dayLabel(status.days[0].day)}</span>
              <span>Today</span>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="past" className="mt-10">
        <h2 id="past" className="text-lg font-semibold">
          Recent outages
        </h2>
        {status.incidents.length === 0 ? (
          <p className="mt-3 text-muted-foreground">
            {status.state === "unknown" ? "Nothing recorded yet." : `None in the last ${status.windowDays} days.`}
          </p>
        ) : (
          <ul className="hairline-y mt-3 overflow-hidden rounded-lg bg-card shadow-border-small">
            {status.incidents.map((i) => (
              <li key={i.from.toISOString()} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <time dateTime={i.from.toISOString()}>
                  {i.from.toLocaleString("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
                {i.to ? (
                  <span className="tabular text-muted-foreground">{lasted(i)}</span>
                ) : (
                  <StatusIndicator tone="error" label="ongoing" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 flex items-center gap-2 text-[13px] text-muted-foreground">
        <NestMark className="size-4" />
        <Link href="/" className="link">
          Hosted with Nest Deploy
        </Link>
      </p>
    </div>
  );
}

/** Same column as the page: name, state card (square, headline, detail, uptime), then the outages list. */
function StatusSkeleton() {
  return (
    <LoadingRegion label="Loading status…" className={column}>
      <SkeletonText size="title-1" width="w-48" />
      <div className="mt-8 rounded-lg bg-card p-6 shadow-border-small" aria-hidden="true">
        <div className="flex h-9 items-center gap-3">
          <Skeleton className="size-3 shrink-0 rounded-none" />
          <Skeleton className="h-8 w-48" />
        </div>
        <SkeletonText size="body" width="w-56" className="mt-2" />
        <div className="mt-5 flex h-[57px] items-center gap-3 border-t pt-4">
          <Skeleton className="h-8 w-20" />
          <SkeletonText size="label" width="w-48" />
        </div>
      </div>
      <div className="mt-10" aria-hidden="true">
        <SkeletonText size="title-3" width="w-32" />
        <div className="hairline-y mt-3 overflow-hidden rounded-lg bg-card shadow-border-small">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <SkeletonText size="body" width="w-44" />
              <SkeletonText size="body" width="w-14" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

/**
 * A faint grid fades out over the top of the page, so the page reads as part
 * of the same product as the homepage without a canvas. The headline and card
 * sit on a layer above it.
 */
export default function StatusPage({ params }: Props) {
  return (
    <main className={cn(pixel.variable, "flex-1 bg-background-subtle")}>
      <div aria-hidden="true" className="relative -mb-56 h-56 overflow-hidden">
        <div
          className="page-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]"
          style={{ backgroundSize: "30px 30px" }}
        />
      </div>
      <Suspense fallback={<StatusSkeleton />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}
