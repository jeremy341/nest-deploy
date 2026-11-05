import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  GitBranchIcon,
  GitCommitIcon,
} from "@phosphor-icons/react/dist/ssr";
import { BuildLogs } from "@/components/build-logs";
import { CommitLink } from "@/components/commit-link";
import { DeploymentActions } from "@/components/deployment-actions";
import { PageHeader } from "@/components/page-header";
import { DeploymentSkeleton } from "@/components/skeletons/deployment";
import { StatusDot } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/current";
import { deploymentLogs } from "@/server/projects";
import { deploymentView } from "@/server/queries";

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Deployment ${id.slice(0, 7)}` };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-label text-muted-foreground">{label}</dt>
      <dd className="font-medium tracking-[-0.02em]">{children}</dd>
    </div>
  );
}

async function Content({ params }: Props) {
  const { slug, id } = await params;
  const user = await requireUser();
  let data;
  try {
    data = await deploymentView(user.id, id);
  } catch {
    notFound();
  }
  const { deployment: d, project, domains } = data;
  if (project.slug !== slug) notFound();

  const logs = (await deploymentLogs(user.id, id)).map((l) => ({
    id: l.id,
    at: l.at.toISOString(),
    level: l.level,
    message: l.message,
  }));
  const address = domains[0];

  return (
    <div className="motion-enter space-y-6">
      <PageHeader
        title={
          <>
            Deployment <span className="font-mono">{id.slice(0, 8)}</span>
          </>
        }
        description={d.commit ?? undefined}
        actions={
          <>
            {address ? (
              <Button
                className="px-3"
                render={<a href={`https://${address}`} target="_blank" rel="noreferrer" />}
              >
                Visit
                <ArrowUpRightIcon aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </Button>
            ) : null}
            <DeploymentActions deployment={d} />
          </>
        }
      />

      {d.state === "error" && d.error ? (
        <Alert tone="error" role="status">
          {d.error}
        </Alert>
      ) : null}

      <section
        aria-labelledby="details-heading"
        className="overflow-hidden rounded-lg bg-card shadow-border-small"
      >
        <div className="border-b px-4 py-3">
          <h2 id="details-heading" className="text-title-3">
            Details
          </h2>
        </div>

        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Created">
            <span className="inline-flex items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback className="text-[10px] uppercase">
                  {(d.author ?? "?").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {d.author ?? d.source}
              <span className="font-normal text-muted-foreground">{d.age}</span>
            </span>
          </Field>
          <Field label="Status">
            <span className="inline-flex items-center gap-2">
              <StatusDot state={d.state} />
              {d.isCurrent ? <span className="font-normal text-muted-foreground">Current</span> : null}
            </span>
          </Field>
          <Field label="Duration">{d.duration}</Field>
          <Field label="Environment">{d.env === "preview" ? "Preview" : "Production"}</Field>
          <Field label="Address">
            <span className="break-all">
              {address ?? (
                <span className="font-normal text-muted-foreground">No domain recorded</span>
              )}
            </span>
          </Field>
          <Field label="Port">
            <span className="tabular font-mono text-[13px] font-normal">{d.port}</span>
          </Field>
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className="mb-1 text-label text-muted-foreground">Source</dt>
            <dd className="space-y-1">
              <p className="flex items-center gap-1.5 font-mono text-[13px]">
                <GitBranchIcon aria-hidden="true" className="size-4 shrink-0" />
                {d.branch}
              </p>
              <p className="flex min-w-0 items-center gap-1.5">
                <GitCommitIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <CommitLink
                  repo={d.repo}
                  sha={d.sha}
                  fallback="pending"
                  className="shrink-0 font-mono text-[13px]"
                />
                <span className="truncate">{d.commit}</span>
              </p>
            </dd>
          </div>
        </dl>
      </section>

      <BuildLogs
        key={`${d.id}-${d.rawState}`}
        deploymentId={d.id}
        initialLines={logs}
        rawState={d.rawState}
        duration={d.duration}
      />
    </div>
  );
}

export default function DeploymentPage({ params }: Props) {
  return (
    <Suspense fallback={<DeploymentSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
