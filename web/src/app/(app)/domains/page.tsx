import { DomainsView } from "@/components/domains-view";
import { PageHeader } from "@/components/page-header";
import { DocsLink } from "@/components/settings-ui";
import { requireUser } from "@/server/auth/current";
import { domainViews, projectViews, serverViews } from "@/server/queries";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
  const user = await requireUser();
  const [domains, projects, servers] = await Promise.all([
    domainViews(user.id),
    projectViews(user.id),
    serverViews(user.id),
  ]);

  return (
    <div className="motion-enter">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Domains"
        description="Route a domain to a port on your Nest container."
        actions={<DocsLink href="/docs/domains" topic="domains" className="max-sm:hidden" />}
      />
      <DomainsView
        initial={domains}
        servers={servers.map((s) => ({ id: s.id, nestUsername: s.nestUsername }))}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          port: p.port,
          serverId: p.serverId,
        }))}
      />
    </div>
  );
}
