import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  GitBranchIcon,
  GithubLogoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { DeploymentRow } from "@/components/deployment-row";
import { RollbackButton } from "@/components/rollback-button";
import { StatusDot } from "@/components/status-dot";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { deploymentsFor, getProject, projects } from "@/lib/mock";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: getProject(slug)?.name ?? "Project" };
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
      <dt className="mb-1 text-[12px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px]">{children}</dd>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading project">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-3 h-9 w-64" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

async function ProjectContent({ params }: Props) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const history = deploymentsFor(slug);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            Projects
          </Link>
          <h1 className="mt-1 truncate text-[28px] leading-9 font-semibold">
            {project.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`https://github.com/${project.repo}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}
          >
            <GithubLogoIcon />
            Repository
          </a>
          <a
            href={`https://${project.domain}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants(), "h-9 px-3")}
          >
            Visit
            <ArrowUpRightIcon />
          </a>
        </div>
      </div>

      {project.state === "error" ? (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-[13px]"
        >
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            The latest deployment failed its health check on port {project.port}.
            The previous release is still serving traffic.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section
            aria-labelledby="production-heading"
            className="rounded-lg border bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <h2 id="production-heading" className="text-sm font-medium">
                Production deployment
              </h2>
              <RollbackButton />
            </div>
            <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
              <Field label="Domain">
                <a
                  href={`https://${project.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all hover:underline"
                >
                  {project.domain}
                </a>
              </Field>
              <Field label="Status">
                <StatusDot state={project.state} />
              </Field>
              <Field label="Created">
                {project.age} by {project.author}
              </Field>
              <Field label="Source">
                <p className="flex items-center gap-1.5">
                  <GitBranchIcon className="size-3.5 shrink-0" />
                  <span className="font-mono text-[12px]">{project.branch}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {project.sha}
                  </span>
                </p>
                <p className="mt-1 truncate text-muted-foreground">
                  {project.commit}
                </p>
              </Field>
            </dl>
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-3 text-sm font-medium">
              Deployments
            </h2>
            <ul className="hairline-y overflow-hidden rounded-lg border bg-card">
              {history.map((d) => (
                <DeploymentRow
                  key={d.id}
                  deployment={d}
                  showProject={false}
                />
              ))}
            </ul>
          </section>
        </div>

        <aside>
          <section
            aria-labelledby="runtime-heading"
            className="rounded-lg border bg-card"
          >
            <div className="border-b px-4 py-3">
              <h2 id="runtime-heading" className="text-sm font-medium">
                Runtime
              </h2>
            </div>
            <dl className="space-y-4 p-4">
              <Field label="Runtime">{project.runtime}</Field>
              <Field label="Start command">
                <code className="font-mono text-[12px]">{project.start}</code>
              </Field>
              <Field label="Port">
                <span className="tabular font-mono text-[12px]">
                  {project.port}
                </span>
              </Field>
              <Field label="Repository">
                <span className="break-all">{project.repo}</span>
              </Field>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function ProjectPage({ params }: Props) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}
