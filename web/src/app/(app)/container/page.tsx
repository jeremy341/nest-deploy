import { Suspense } from "react";
import { ContainerSkeleton } from "@/components/container-skeleton";
import { ContainerView } from "@/components/container-view";
import { requireUser } from "@/server/auth/current";
import { normalizePermissions } from "@/lib/container-permissions";
import { permissionsOf } from "@/server/permissions";
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
        // A missing or unreadable value keeps the default (on); the server still enforces the switch.
        orphanRemoval: normalizePermissions(permissionsOf(s)).orphanRemoval,
      }))}
    />
  );
}
