import { LogsView } from "@/components/logs-view";
import { PageHeader } from "@/components/page-header";
import { DocsLink } from "@/components/settings-ui";
import { requireUser } from "@/server/auth/current";
import { projectViews } from "@/server/queries";

export const metadata = { title: "Logs" };

export default async function LogsPage() {
  const user = await requireUser();
  const projects = await projectViews(user.id);

  return (
    <div className="motion-enter">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Logs"
        description="What your apps print while they run, read from your container."
        actions={<DocsLink href="/docs/logs" topic="logs" className="max-sm:hidden" />}
      />
      <LogsView projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
