import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProjectSettings } from "@/components/project-settings";
import { SettingsSkeleton } from "@/components/skeletons/settings";
import { requireUser } from "@/server/auth/current";
import { listEnvVars } from "@/server/projects";
import { projectViews } from "@/server/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug} settings` };
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();
  const env = await listEnvVars(user.id, project.id);
  return <ProjectSettings project={project} env={env} />;
}

export default function ProjectSettingsPage({ params }: Props) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
