import { DomainsView } from "@/components/domains-view";
import { PageHeader } from "@/components/page-header";
import { domains, server } from "@/lib/mock";

export const metadata = { title: "Domains" };

export default function DomainsPage() {
  return (
    <>
      <PageHeader
        title="Domains"
        description="Route a domain to a port on your Nest container."
      />
      <DomainsView initial={domains} host={server.host} />
    </>
  );
}
