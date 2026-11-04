import { Suspense } from "react";
import Link from "next/link";
import { HardDrivesIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { ResourceChart } from "@/components/resource-chart";
import { ResourcesSkeleton } from "@/components/skeletons/resources";
import { DocsLink } from "@/components/settings-ui";
import { Sparkline } from "@/components/sparkline";
import { StatusIndicator } from "@/components/status-dot";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/current";
import { projectResources, serverViews, usageHistory } from "@/server/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Resources" };

type Props = { searchParams: Promise<{ range?: string; server?: string }> };

const RANGES = [
  { value: "24h", label: "24 hours", hours: 24 },
  { value: "7d", label: "7 days", hours: 168 },
] as const;

export default function ResourcesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ResourcesSkeleton />}>
      <ResourcesContent searchParams={searchParams} />
    </Suspense>
  );
}

const gb = (mb: number) => (mb / 1024).toFixed(1);

async function ResourcesContent({ searchParams }: Props) {
  const user = await requireUser();
  const { range: rawRange, server: serverId } = await searchParams;
  const range = RANGES.find((r) => r.value === rawRange) ?? RANGES[0];
  const servers = await serverViews(user.id);
  const server = servers.find((s) => s.id === serverId) ?? servers[0];

  if (!server) {
    return (
      <div className="motion-enter">
        <PageHeader title="Resources" description="How much of your Nest container is in use, now and over time." />
        <EmptyState
          icon={<HardDrivesIcon />}
          title="Connect a server first"
          description="Once a server is connected, its CPU, memory and disk are sampled every few minutes and shown here."
          action={
            <Link href="/connect" className={cn(buttonVariants({ variant: "default" }), "px-3")}>
              Connect a server
            </Link>
          }
        />
      </div>
    );
  }

  const [history, allProjects] = await Promise.all([
    usageHistory(user.id, server.id, range.hours),
    projectResources(user.id, range.hours),
  ]);
  const projects = allProjects.filter((p) => p.serverId === server.id);
  const u = server.usage;
  const href = (r: string, s = server.id) => `/resources?range=${r}${servers.length > 1 ? `&server=${s}` : ""}`;

  return (
    <div className="motion-enter space-y-6">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Resources"
        description={`CPU, memory and disk of ${server.nestUsername}.hackclub.app, now and over time.`}
        actions={<DocsLink href="/docs/monitoring" topic="monitoring" className="max-sm:hidden" />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Time range" className="shadow-border-base inline-flex gap-0.5 rounded-md bg-background p-0.5">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={href(r.value)}
              aria-current={r.value === range.value ? "true" : undefined}
              className={cn(
                "pressable inline-flex h-7 items-center rounded-[4px] px-3 text-[13px] font-medium tracking-[-0.02em] max-sm:h-10",
                r.value === range.value
                  ? "bg-[var(--ds-gray-200)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Last {r.label}
            </Link>
          ))}
        </nav>
        {servers.length > 1 ? (
          <nav aria-label="Server" className="flex flex-wrap gap-1.5">
            {servers.map((s) => (
              <Link
                key={s.id}
                href={href(range.value, s.id)}
                aria-current={s.id === server.id ? "true" : undefined}
                className={cn(
                  "pressable inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium max-sm:h-10",
                  s.id === server.id ? "shadow-border-base bg-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.nestUsername}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ResourceChart
          title="CPU load"
          now={u?.cpuLoad !== null && u?.cpus ? `${u.cpuLoad!.toFixed(2)} / ${u.cpus}` : null}
          detail={u?.cpus ? `${u.cpus} vCPU, 1 minute load average` : "1 minute load average"}
          points={history.map((p) => ({ at: p.at, value: p.cpu }))}
          rangeLabel={range.label}
        />
        <ResourceChart
          title="Memory"
          now={u?.memUsedMb !== null && u?.memTotalMb ? `${gb(u.memUsedMb!)} / ${gb(u.memTotalMb)} GB` : null}
          detail={u?.memTotalMb ? `${gb(u.memTotalMb)} GB available to your container` : undefined}
          points={history.map((p) => ({ at: p.at, value: p.mem }))}
          rangeLabel={range.label}
        />
        <ResourceChart
          title="Disk"
          now={u?.diskUsedMb !== null && u?.diskTotalMb ? `${gb(u.diskUsedMb!)} / ${gb(u.diskTotalMb)} GB` : null}
          detail={u?.diskTotalMb ? `${gb(u.diskTotalMb)} GB for releases, logs and data` : undefined}
          points={history.map((p) => ({ at: p.at, value: p.disk }))}
          rangeLabel={range.label}
        />
      </div>

      <section aria-labelledby="by-project" className="overflow-hidden rounded-lg bg-card shadow-border-small">
        <div className="border-b px-4 py-3">
          <h2 id="by-project" className="text-title-3">
            By project
          </h2>
          <p className="mt-0.5 text-label text-muted-foreground">
            What each service used on its own over the last {range.label}. CPU is a share of one core, so it can pass
            100%.
          </p>
        </div>
        {projects.length === 0 ? (
          <p className="px-4 py-5 text-muted-foreground">No projects on this server yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b text-label text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Memory
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    CPU
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Restarts
                  </th>
                  <th scope="col" className="w-40 px-4 py-2.5 font-medium">
                    Memory trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((p) => {
                  const peak = p.memPeak ?? 0;
                  return (
                    <tr key={p.id} className="transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <Link
                          href={`/projects/${p.slug}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.monitor === "down" ? (
                          <span className="ml-2 inline-block align-middle">
                            <StatusIndicator tone="error" label="Down" />
                          </span>
                        ) : null}
                      </th>
                      <td className="tabular px-4 py-3 font-mono text-[13px]">
                        {p.memNow !== null ? (
                          <>
                            {p.memNow.toFixed(0)} MB
                            <span className="text-muted-foreground"> / peak {(p.memPeak ?? 0).toFixed(0)}</span>
                          </>
                        ) : (
                          <span className="font-sans text-muted-foreground">No readings</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 font-mono text-[13px]">
                        {p.cpuNow !== null ? (
                          <>
                            {p.cpuNow.toFixed(1)}%
                            <span className="text-muted-foreground"> / peak {(p.cpuPeak ?? 0).toFixed(1)}</span>
                          </>
                        ) : (
                          <span className="font-sans text-muted-foreground">No readings</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 font-mono text-[13px]">{p.restarts ?? "None"}</td>
                      <td className="px-4 py-2">
                        <Sparkline
                          className="mt-0"
                          points={p.points.map((x) => ({ at: x.at, value: x.memMb }))}
                          max={Math.max(peak * 1.15, 1)}
                          label={`${p.name} memory over the last ${range.label}, peak ${peak.toFixed(0)} megabytes`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="max-w-[68ch] text-label text-muted-foreground">
        The worker reads these every five minutes. The container figures cover everything running in your Nest
        container; the project figures are that one service. A gap in a line means no reading was taken then.
      </p>
    </div>
  );
}
