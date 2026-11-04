import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { DeploymentsSkeleton } from "@/components/skeletons/deployments";
import { requireUser } from "@/server/auth/current";
import { deploymentViews, projectViews } from "@/server/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug} deployments` };
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();
  const deployments = await deploymentViews(user.id, { projectId: project.id });

  return (
    <div className="motion-enter">
      <PageHeader title="Deployments" description="Every release of this project, newest first." />
      <DeploymentsView deployments={deployments} showProject={false} />
    </div>
  );
}

export default function ProjectDeploymentsPage({ params }: Props) {
  return (
    <Suspense fallback={<DeploymentsSkeleton showProject={false} />}>
      <Content params={params} />
    </Suspense>
  );
}
