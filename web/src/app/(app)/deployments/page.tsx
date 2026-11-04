import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { DocsLink } from "@/components/settings-ui";
import { requireUser } from "@/server/auth/current";
import { deploymentViews } from "@/server/queries";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const user = await requireUser();
  const deployments = await deploymentViews(user.id);

  return (
    <div className="motion-enter">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Deployments"
        description="Every build and release across your projects."
        actions={<DocsLink href="/docs/deployments" topic="deployments" className="max-sm:hidden" />}
      />
      <DeploymentsView deployments={deployments} />
    </div>
  );
}
