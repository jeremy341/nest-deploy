import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TerminalSkeleton } from "@/components/terminal-skeleton";
import { TerminalView } from "@/components/terminal-view";
import { permissionsOrDefault } from "@/lib/container-permissions";
import { requireUser } from "@/server/auth/current";
import { getPermissions } from "@/server/permissions";
import { projectViews } from "@/server/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug} terminal` };
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();
  // If the permissions cannot be read, the terminal counts as off (the default).
  const permissions = await permissionsOrDefault(() => getPermissions(user.id, project.serverId));

  return (
    <div className="motion-enter">
      <PageHeader
        title="Terminal"
        description="A live shell on your Nest container, starting in this project's folder."
      />
      <TerminalView
        projectId={project.id}
        projectName={project.name}
        host={`${project.nestUsername}.hackclub.app`}
        enabled={permissions.terminal}
      />
    </div>
  );
}

export default function ProjectTerminalPage({ params }: Props) {
  return (
    <Suspense fallback={<TerminalSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
