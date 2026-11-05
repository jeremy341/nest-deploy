import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FileManager } from "@/components/file-manager";
import { FilesSkeleton } from "@/components/file-manager-skeleton";
import { permissionsOrDefault } from "@/lib/container-permissions";
import { requireUser } from "@/server/auth/current";
import { getPermissions } from "@/server/permissions";
import { projectViews } from "@/server/queries";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ path?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug} files` };
}

async function Content({ params, searchParams }: Props) {
  const { slug } = await params;
  const { path } = await searchParams;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();
  // If the permissions cannot be read, file changes keep their default (on); the server still enforces.
  const permissions = await permissionsOrDefault(() => getPermissions(user.id, project.serverId));
  return (
    <FileManager
      projectId={project.id}
      slug={project.slug}
      projectName={project.name}
      fileWrites={permissions.fileWrites}
      initialPath={Array.isArray(path) ? (path[0] ?? "") : (path ?? "")}
    />
  );
}

export default function ProjectFilesPage(props: Props) {
  return (
    <Suspense fallback={<FilesSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
