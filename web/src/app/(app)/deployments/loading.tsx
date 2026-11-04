import { DeploymentsSkeleton } from "@/components/skeletons/deployments";

/** Loading state for /deployments. */
export default function Loading() {
  return <DeploymentsSkeleton showProject />;
}
