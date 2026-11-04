import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
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
    <>
      <PageHeader title="Deployments" description="Every release of this project, newest first." />
      <DeploymentsView deployments={deployments} showProject={false} />
    </>
  );
}

export default function ProjectDeploymentsPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading deployments">
          <div className="skeleton-sweep mb-6 h-9 w-48 rounded-md" />
          <div className="skeleton-sweep h-64 w-full rounded-lg" />
        </div>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}
