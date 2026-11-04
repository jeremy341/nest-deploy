import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { deployments } from "@/lib/mock";

export const metadata = { title: "Deployments" };

export default function DeploymentsPage() {
  return (
    <>
      <PageHeader
        title="Deployments"
        description="Every build and release across the projects on this server."
      />
      <DeploymentsView deployments={deployments} />
    </>
  );
}
