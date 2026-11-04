import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import type { ServerView } from "@/server/queries";

type Row = { label: string; used: number; total: number; display: string };

function rows(usage: NonNullable<ServerView["usage"]>): Row[] {
  const out: Row[] = [];
  if (usage.cpuLoad !== null && usage.cpus) {
    out.push({
      label: "CPU load",
      used: Math.min(usage.cpuLoad, usage.cpus),
      total: usage.cpus,
      display: `${usage.cpuLoad.toFixed(2)} / ${usage.cpus}`,
    });
  }
  if (usage.memUsedMb !== null && usage.memTotalMb) {
    out.push({
      label: "Memory",
      used: usage.memUsedMb,
      total: usage.memTotalMb,
      display: `${(usage.memUsedMb / 1024).toFixed(1)} / ${(usage.memTotalMb / 1024).toFixed(1)} GB`,
    });
  }
  if (usage.diskUsedMb !== null && usage.diskTotalMb) {
    out.push({
      label: "Disk",
      used: usage.diskUsedMb,
      total: usage.diskTotalMb,
      display: `${(usage.diskUsedMb / 1024).toFixed(1)} / ${(usage.diskTotalMb / 1024).toFixed(1)} GB`,
    });
  }
  return out;
}

/**
 * Container usage from the last time we talked to the server: three meters in
 * one strip. The history lives on the Resources page.
 */
export function UsageCard({ server }: { server: ServerView | undefined }) {
  const list = server?.usage ? rows(server.usage) : [];

  return (
    <section aria-labelledby="usage-heading" className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="usage-heading" className="text-title-3">
            Container usage
          </h2>
          <p className="mt-0.5 truncate text-label text-muted-foreground">
            {server ? `${server.nestUsername}.hackclub.app` : "No server connected"}
          </p>
        </div>
        {server ? (
          <Link
            href="/resources"
            className="group inline-flex shrink-0 items-center gap-1 text-label font-medium text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground max-sm:min-h-10"
          >
            Resources
            <ArrowRightIcon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-(--dur-fast) group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-5 text-muted-foreground">
          {server
            ? "Run Test connection on the Connect page to read usage."
            : "Connect a server to see its usage."}
        </p>
      ) : (
        <ul className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {list.map((item) => {
            const ratio = item.total > 0 ? item.used / item.total : 0;
            const hot = ratio >= 0.8;
            return (
              <li key={item.label} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{item.label}</span>
                  <span className="tabular font-mono text-[12px] text-muted-foreground">
                    {item.display}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`${item.label} usage`}
                  aria-valuemin={0}
                  aria-valuemax={item.total}
                  aria-valuenow={item.used}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn("h-full rounded-full", hot ? "bg-warning" : "bg-foreground")}
                    style={{ width: `${Math.round(Math.min(ratio, 1) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
