import { DomainsView } from "@/components/domains-view";
import { PageHeader } from "@/components/page-header";
import { FactLine, type PixelTone } from "@/components/pixel-kit";
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

  const invalid = domains.filter((d) => d.status === "invalid").length;
  const unchecked = domains.filter((d) => d.status === "pending").length;
  const tones: PixelTone[] = domains.map((d) =>
    d.status === "valid" ? "ready" : d.status === "invalid" ? "error" : "neutral"
  );

  return (
    <div className="motion-enter">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Domains"
        description={
          domains.length > 0 ? (
            <FactLine tones={tones}>
              {domains.length} {domains.length === 1 ? "domain" : "domains"}.{" "}
              {invalid > 0
                ? `${invalid} ${invalid === 1 ? "needs" : "need"} attention.`
                : unchecked > 0
                  ? `${unchecked} not checked yet.`
                  : "All valid."}
            </FactLine>
          ) : (
            "Route a domain to a port on your Nest container."
          )
        }
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
