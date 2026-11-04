import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  GitBranchIcon,
  GitCommitIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentActions } from "@/components/deployment-actions";
import { StatusDot } from "@/components/status-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth/current";
import { deploymentLogs } from "@/server/projects";
import { deploymentView } from "@/server/queries";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Deployment ${id.slice(0, 7)}` };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[13px] text-muted-foreground">{label}</dt>
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
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground">
        <Link href={`/projects/${slug}/deployments`} className="hover:text-foreground">
          Project Deployments
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="font-mono text-[13px] text-foreground">{id.slice(0, 8)}</span>
      </nav>

      {d.state === "error" && d.error ? (
        <div role="status" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>{d.error}</p>
        </div>
      ) : null}

      <section aria-labelledby="details-heading" className="rounded-lg bg-card shadow-border-small">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h1 id="details-heading" className="font-medium tracking-[-0.02em]">
            Deployment Details
          </h1>
          <div className="flex items-center gap-2">
            {address ? (
              <a
                href={`https://${address}`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants(), "px-3")}
              >
                Visit
                <ArrowUpRightIcon />
              </a>
            ) : null}
            <DeploymentActions deployment={d} />
          </div>
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
            <dt className="mb-1 text-[13px] text-muted-foreground">Source</dt>
            <dd className="space-y-1">
              <p className="flex items-center gap-1.5 font-mono text-[13px]">
                <GitBranchIcon className="size-4 shrink-0" />
                {d.branch}
              </p>
              <p className="flex min-w-0 items-center gap-1.5">
                <GitCommitIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-mono text-[13px]">{(d.sha ?? "").slice(0, 7) || "pending"}</span>
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
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading deployment" className="space-y-6">
          <div className="skeleton-sweep h-4 w-48 rounded-md" />
          <div className="skeleton-sweep h-56 w-full rounded-lg" />
          <div className="skeleton-sweep h-12 w-full rounded-lg" />
        </div>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}
