import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { deploymentsFor, getProject, projects } from "@/lib/mock";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${getProject(slug)?.name ?? "Project"} deployments` };
}

async function Content({ params }: Props) {
  const { slug } = await params;
  if (!getProject(slug)) notFound();

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Every release of this project, newest first."
      />
      <DeploymentsView deployments={deploymentsFor(slug)} showProject={false} />
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
