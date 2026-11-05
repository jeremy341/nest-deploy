import { DeploymentsView } from "@/components/deployments-view";
import { PageHeader } from "@/components/page-header";
import { FactLine, toneOf } from "@/components/pixel-kit";
import { DocsLink } from "@/components/settings-ui";
import { requireUser } from "@/server/auth/current";
import { deploymentViews } from "@/server/queries";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const user = await requireUser();
  const deployments = await deploymentViews(user.id);
  const projects = new Set(deployments.map((d) => d.projectId)).size;
  const building = deployments.filter((d) => d.state === "building" || d.state === "queued").length;
  const failed = deployments.filter((d) => d.state === "error").length;

  return (
    <div className="motion-enter">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Deployments"
        description={
          deployments.length > 0 ? (
            <FactLine tones={deployments.slice(0, 24).map((d) => toneOf(d.state))}>
              {deployments.length} {deployments.length === 1 ? "deployment" : "deployments"} across{" "}
              {projects} {projects === 1 ? "project" : "projects"}.
              {building > 0 ? ` ${building} building.` : ""}
              {failed > 0 ? ` ${failed} failed.` : ""}
            </FactLine>
          ) : (
            "Every build and release across your projects."
          )
        }
        actions={<DocsLink href="/docs/deployments" topic="deployments" className="max-sm:hidden" />}
      />
      <DeploymentsView deployments={deployments} />
    </div>
  );
}
