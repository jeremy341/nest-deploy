import Link from "next/link";
import { ProjectsView } from "@/components/projects-view";
import { UsageCard } from "@/components/usage-card";
import { projects } from "@/lib/mock";

export const metadata = { title: "Projects" };

function AlertsCard() {
  const failing = projects.filter((p) => p.state === "error");

  return (
    <section aria-labelledby="alerts-heading" className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h2 id="alerts-heading" className="text-sm font-medium">
          Alerts
        </h2>
      </div>
      {failing.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted-foreground">
          Nothing needs attention.
        </p>
      ) : (
        <ul className="hairline-y">
          {failing.map((p) => (
            <li key={p.slug} className="px-4 py-3 text-[13px]">
              <Link
                href={`/projects/${p.slug}`}
                className="font-medium hover:underline"
              >
                {p.name}
              </Link>
              <p className="mt-0.5 text-muted-foreground">
                The latest deployment failed its health check. The previous
                release is still serving traffic.
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProjectsPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="order-2 space-y-4 lg:order-1">
        <UsageCard />
        <AlertsCard />
      </aside>
      <div className="order-1 lg:order-2">
        <ProjectsView projects={projects} />
      </div>
    </div>
  );
}
