import { Suspense } from "react";
import Link from "next/link";
import { GitBranchIcon } from "@phosphor-icons/react/dist/ssr";
import { ProjectsView } from "@/components/projects-view";
import { ProjectsSkeleton } from "@/components/skeletons/projects";
import { StatusDot, StatusIndicator } from "@/components/status-dot";
import { UsageCard } from "@/components/usage-card";
import { requireUser } from "@/server/auth/current";
import { alertOverview } from "@/server/notify";
import { deploymentViews, projectViews, serverViews } from "@/server/queries";

export const metadata = { title: "Projects" };

function SideCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-lg bg-card shadow-border-small"
    >
      <div className="border-b px-4 py-3">
        <h2 id={id} className="text-title-3">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** Plain sentences for any resource that has reached the limit set in a project's alerts. */
function resourcePressure(
  u: NonNullable<Awaited<ReturnType<typeof serverViews>>[number]["usage"]>,
  limits: { diskPct: number; memoryPct: number; cpuPct: number }
) {
  const out: { label: string; text: string }[] = [];
  if (u.diskUsedMb !== null && u.diskTotalMb && (u.diskUsedMb / u.diskTotalMb) * 100 >= limits.diskPct) {
    out.push({
      label: "Disk",
      text: `Disk is over ${limits.diskPct}% full. Old releases and logs are the usual cause.`,
    });
  }
  if (u.memUsedMb !== null && u.memTotalMb && (u.memUsedMb / u.memTotalMb) * 100 >= limits.memoryPct) {
    out.push({
      label: "Memory",
      text: `Memory is over ${limits.memoryPct}% used. Apps may be restarted by the system.`,
    });
  }
  if (u.cpuLoad !== null && u.cpus && (u.cpuLoad / u.cpus) * 100 >= limits.cpuPct) {
    out.push({
      label: "CPU",
      text: `CPU load is over ${limits.cpuPct}% of the cores. Apps may answer slowly.`,
    });
  }
  return out;
}

function mutedUntil(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsContent />
    </Suspense>
  );
}

async function ProjectsContent() {
  const user = await requireUser();
  const [projects, servers, recent, alerts] = await Promise.all([
    projectViews(user.id),
    serverViews(user.id),
    deploymentViews(user.id, { limit: 5 }),
    alertOverview(user.id),
  ]);
  const down = projects.filter((p) => p.monitor === "down");
  const failing = projects.filter((p) => p.state === "error" && p.monitor !== "down");
  const pressure = servers[0]?.usage ? resourcePressure(servers[0].usage, alerts.limits) : [];

  const needsAttention = down.length + failing.length + pressure.length + alerts.muted.length > 0;

  return (
    <div className="motion-enter space-y-6">
      <h1 className="sr-only">Projects</h1>

      {/* Only shown when something is wrong, so a healthy page has nothing extra on it. */}
      {needsAttention ? (
        <section
          aria-labelledby="alerts-heading"
          className="overflow-hidden rounded-lg bg-card shadow-border-small"
        >
          <h2 id="alerts-heading" className="border-b px-4 py-3 text-title-3">
            Needs attention
          </h2>
          <ul className="hairline-y">
            {down.map((p) => (
                            <li key={`down-${p.id}`} className="px-4 py-3">
                              <StatusIndicator
                                tone="error"
                                label={
                                  <Link
                                    href={`/projects/${p.slug}`}
                                    className="text-foreground underline-offset-4 hover:underline"
                                  >
                                    {p.name}
                                  </Link>
                                }
                              />
                              <p className="mt-0.5 text-muted-foreground">
                                Not answering{p.monitorSince ? ` since ${p.monitorSince}` : ""}.
                              </p>
                            </li>
                          ))}
                          {pressure.map((item) => (
                            <li key={item.label} className="px-4 py-3">
                              <StatusIndicator tone="warning" label={item.label} />
                              <p className="mt-0.5 text-muted-foreground">{item.text}</p>
                            </li>
                          ))}
                          {failing.map((p) => (
                            <li key={p.id} className="px-4 py-3">
                              <StatusIndicator
                                tone="error"
                                label={
                                  <Link
                                    href={`/projects/${p.slug}`}
                                    className="text-foreground underline-offset-4 hover:underline"
                                  >
                                    {p.name}
                                  </Link>
                                }
                              />
                              <p className="mt-0.5 text-muted-foreground">
                                The latest deployment failed. Open it to see why.
                              </p>
                            </li>
                          ))}
                          {alerts.muted.map((p) => (
                            <li key={`muted-${p.id}`} className="px-4 py-3">
                              <StatusIndicator
                                tone="neutral"
                                label={
                                  <Link
                                    href={`/projects/${p.slug}/settings#alerts-heading`}
                                    className="text-foreground underline-offset-4 hover:underline"
                                  >
                                    {p.name}
                                  </Link>
                                }
                              />
                              <p className="mt-0.5 text-muted-foreground">
                                Alerts are paused
                                {p.until ? ` until ${mutedUntil(p.until)}` : " until you resume them"}.
                              </p>
                            </li>
                          ))}
          </ul>
        </section>
      ) : null}

      <UsageCard server={servers[0]} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ProjectsView projects={projects} hasServer={servers.length > 0} />
        </div>
        {recent.length > 0 ? (
          <aside className="min-w-0" aria-label="Recent activity">
            <SideCard id="recent-heading" title="Recent deployments">
              <ul className="hairline-y">
                {recent.map((d) => (
                  <li
                    key={d.id}
                    className="row-focus relative px-4 py-3 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/projects/${d.projectSlug}/deployments/${d.id}`}
                        className="min-w-0 truncate font-medium tracking-[-0.02em] after:absolute after:inset-0 after:content-['']"
                      >
                        {d.projectName}
                      </Link>
                      <StatusDot state={d.state} showLabel={false} />
                    </div>
                    <p className="mt-0.5 truncate text-muted-foreground">
                      {d.commit ?? `${d.source} deployment`}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-label text-muted-foreground">
                      <GitBranchIcon aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="truncate font-mono">{d.branch}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{d.age}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <Link
                href="/deployments"
                className="block border-t px-4 py-2.5 text-label font-medium text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground max-sm:py-3"
              >
                All deployments
              </Link>
            </SideCard>
          </aside>
        ) : null}
      </div>
    </div>
  );}
