import { Suspense } from "react";
import { ContainerSkeleton } from "@/components/container-skeleton";
import { ContainerView } from "@/components/container-view";
import { requireUser } from "@/server/auth/current";
import { listServers } from "@/server/servers";

export const metadata = { title: "Container" };

export default function ContainerPage() {
  return (
    <Suspense fallback={<ContainerSkeleton />}>
      <ContainerContent />
    </Suspense>
  );
}

async function ContainerContent() {
  const user = await requireUser();
  const servers = await listServers(user.id);
  return (
    <ContainerView
      servers={servers.map((s) => ({
        id: s.id,
        label: s.host === "hackclub.app" ? `${s.nestUsername}.hackclub.app` : s.host,
      }))}
    />
  );
}
