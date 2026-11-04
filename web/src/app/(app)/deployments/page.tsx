import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/current";
import { deploymentViews } from "@/server/queries";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const user = await requireUser();
  const deployments = await deploymentViews(user.id);

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Every build and release across your projects."
      />
      <DeploymentsView deployments={deployments} />
    </>
  );
}
