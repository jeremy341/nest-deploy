import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  GitBranchIcon,
  GitCommitIcon,
} from "@phosphor-icons/react/dist/ssr";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentActions } from "@/components/deployment-actions";
import { StatusDot } from "@/components/status-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  buildLogFor,
  deployments,
  getDeployment,
  getProject,
  isCurrentProduction,
} from "@/lib/mock";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string; id: string }> };

export function generateStaticParams() {
  return deployments.map((d) => ({ slug: d.projectSlug, id: d.id }));
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Deployment ${id}` };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tracking-[-0.02em]">{children}</dd>
    </div>
  );
}

async function Content({ params }: Props) {
  const { slug, id } = await params;
  const project = getProject(slug);
  const deployment = getDeployment(slug, id);
  if (!project || !deployment) notFound();

  const current = isCurrentProduction(deployment);
  const lines = buildLogFor(deployment);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground">
        <Link
          href={`/projects/${slug}/deployments`}
          className="hover:text-foreground"
        >
          Project Deployments
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="font-mono text-[13px] text-foreground">{id}</span>
      </nav>

      <section
        aria-labelledby="details-heading"
        className="rounded-lg bg-card shadow-border-small"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h1
            id="details-heading"
            className="font-medium tracking-[-0.02em]"
          >
            Deployment Details
          </h1>
          <div className="flex items-center gap-2">
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants(), "px-3")}
            >
              Visit
              <ArrowUpRightIcon />
            </a>
            <DeploymentActions id={id} />
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Created">
            <span className="inline-flex items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback className="text-[10px] uppercase">
                  {deployment.author.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {deployment.author}
              <span className="font-normal text-muted-foreground">
                {deployment.age}
              </span>
            </span>
          </Field>
          <Field label="Status">
            <span className="inline-flex items-center gap-2">
              <StatusDot state={deployment.state} />
              {current ? (
                <span className="font-normal text-muted-foreground">
                  Current
                </span>
              ) : null}
            </span>
          </Field>
          <Field label="Duration">{deployment.duration}</Field>
          <Field label="Environment">{deployment.env}</Field>
          <Field label="Domain">
            <span className="break-all">{project.domain}</span>
          </Field>
          <Field label="Port">
            <span className="tabular font-mono text-[13px] font-normal">
              {project.port}
            </span>
          </Field>
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className="mb-1 text-[13px] text-muted-foreground">Source</dt>
            <dd className="space-y-1">
              <p className="flex items-center gap-1.5 font-mono text-[13px]">
                <GitBranchIcon className="size-4 shrink-0" />
                {deployment.branch}
              </p>
              <p className="flex min-w-0 items-center gap-1.5">
                <GitCommitIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-mono text-[13px]">
                  {deployment.id}
                </span>
                <span className="truncate">{deployment.commit}</span>
              </p>
            </dd>
          </div>
        </dl>
      </section>

      <BuildLogs
        lines={lines}
        state={deployment.state}
        duration={deployment.duration}
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
