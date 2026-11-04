import Link from "next/link";
import { GitBranchIcon } from "@phosphor-icons/react/dist/ssr";
import { ProjectsView } from "@/components/projects-view";
import { StatusDot } from "@/components/status-dot";
import { UsageCard } from "@/components/usage-card";
import { requireUser } from "@/server/auth/current";
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
    <section aria-labelledby={id} className="rounded-lg bg-card shadow-border-small">
      <div className="border-b px-4 py-3">
        <h2 id={id} className="text-sm font-medium tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, servers, recent] = await Promise.all([
    projectViews(user.id),
    serverViews(user.id),
    deploymentViews(user.id, { limit: 5 }),
  ]);
  const failing = projects.filter((p) => p.state === "error");

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="order-2 flex flex-col gap-4 lg:order-1">
        <UsageCard server={servers[0]} />

        <SideCard id="alerts-heading" title="Alerts">
          {failing.length === 0 ? (
            <p className="px-4 py-6 text-muted-foreground">Nothing needs attention.</p>
          ) : (
            <ul className="hairline-y">
              {failing.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <Link
                    href={`/projects/${p.slug}`}
                    className="font-medium tracking-[-0.02em] hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-0.5 text-muted-foreground">
                    The latest deployment failed. Open it to see why.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SideCard>

        {recent.length > 0 ? (
          <SideCard id="recent-heading" title="Recent deployments">
            <ul className="hairline-y">
              {recent.map((d) => (
                <li key={d.id} className="relative px-4 py-3">
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
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <GitBranchIcon className="size-3.5 shrink-0" />
                    <span className="truncate font-mono">{d.branch}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">{d.age}</span>
                  </p>
                </li>
              ))}
            </ul>
          </SideCard>
        ) : null}
      </div>
      <div className="order-1 lg:order-2">
        <ProjectsView projects={projects} hasServer={servers.length > 0} />
      </div>
    </div>
  );
}
