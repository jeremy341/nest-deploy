import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Stagger } from "@/components/motion/stagger";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/current";
import { listActivity } from "@/server/audit";
import { timeAgo } from "@/lib/status";

export const metadata = { title: "Activity" };

type Entry = Awaited<ReturnType<typeof listActivity>>[number];

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fullTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** Entries grouped by UTC calendar day, in the order they arrive (newest first). */
function groupByDay(entries: Entry[], now: Date) {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const groups: { day: string; label: string; entries: Entry[] }[] = [];
  for (const e of entries) {
    const day = new Date(e.at).toISOString().slice(0, 10);
    const last = groups.at(-1);
    if (last && last.day === day) {
      last.entries.push(e);
    } else {
      const label =
        day === today ? "Today" : day === yesterday ? "Yesterday" : dayLabel.format(new Date(e.at));
      groups.push({ day, label, entries: [e] });
    }
  }
  return groups;
}

function EntryRow({ e }: { e: Entry }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3">
      <p className="min-w-0">
        <span>{e.label}</span>
        {e.target ? <span className="font-medium"> {e.target}</span> : null}
        {e.detail ? <span className="text-muted-foreground"> ({e.detail})</span> : null}
      </p>
      <time
        dateTime={e.at}
        title={fullTime.format(new Date(e.at))}
        className="tabular shrink-0 text-label text-muted-foreground"
      >
        {timeAgo(new Date(e.at))}
      </time>
    </li>
  );
}

const LIST = "hairline-y overflow-hidden rounded-lg bg-card shadow-border-small";

export default async function ActivityPage() {
  const user = await requireUser();
  const entries = await listActivity(user.id, 200);
  const groups = groupByDay(entries, new Date());

  return (
    <div className="motion-enter">
      <PageHeader
        title="Activity"
        description="Changes made to your projects, domains and servers, newest first."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<ClockCounterClockwiseIcon />}
          title="No activity yet"
          description="Deploys, setting changes and restarts show up here."
        />
      ) : (
        groups.map((g, i) => (
          <section key={g.day} className="mt-6 first:mt-0">
            <h2
              id={`day-${g.day}`}
              className="mb-2 text-label font-medium text-muted-foreground"
            >
              {g.label}
            </h2>
            {i === 0 ? (
              <Stagger as="ol" aria-labelledby={`day-${g.day}`} className={LIST}>
                {g.entries.map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </Stagger>
            ) : (
              <ol aria-labelledby={`day-${g.day}`} className={LIST}>
                {g.entries.map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </div>
  );
}
