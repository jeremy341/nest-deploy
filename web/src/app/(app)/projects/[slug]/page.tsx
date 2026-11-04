import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  CaretRightIcon,
  GitBranchIcon,
  GitCommitIcon,
  GithubLogoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { RollbackButton } from "@/components/rollback-button";
import { Sparkline } from "@/components/sparkline";
import { StatusDot } from "@/components/status-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
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
      <dt className="mb-1 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tracking-[-0.02em]">{children}</dd>
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("skeleton-sweep rounded-md", className)} />;
}

function ProjectSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading project" className="space-y-6">
      <Skeleton className="h-72 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

async function ProjectContent({ params }: Props) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const history = deploymentsFor(slug);
  // History is newest first, so keep the first deployment seen per branch.
  const branches = history.filter(
    (d, i) => history.findIndex((x) => x.branch === d.branch) === i
  );

  return (
    <div className="space-y-6">
      {project.state === "error" ? (
        <div
          role="status"
          className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
        >
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            The latest deployment failed its health check on port {project.port}.
            The previous release is still serving traffic.
          </p>
        </div>
      ) : null}

      {/* Production deployment */}
      <section
        aria-labelledby="production-heading"
        className="rounded-lg bg-card shadow-border-small"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2
            id="production-heading"
            className="font-medium tracking-[-0.02em]"
          >
            Production Deployment
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={`https://github.com/${project.repo}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open repository on GitHub"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
            >
              <GithubLogoIcon />
            </a>
            <RollbackButton />
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants(), "px-3")}
            >
              Visit
              <ArrowUpRightIcon />
            </a>
          </div>
        </div>

        <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div
            role="img"
            aria-label="Preview not available yet"
            className="shadow-border-base flex aspect-[16/10] flex-col items-center justify-center gap-1 rounded-md bg-[var(--ds-gray-100)] px-4 text-center"
          >
            <span className="font-mono text-[13px] text-muted-foreground">
              {project.domain}
            </span>
            <span className="text-[12px] text-subtle-foreground">
              Screenshot previews are not built yet
            </span>
          </div>

          <dl className="grid content-start gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Deployment">
              <span className="font-mono text-[13px] font-normal">
                {history[0]?.id ?? project.sha}
              </span>
            </Field>
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
              <span className="inline-flex items-center gap-2">
                {project.age} by {project.author}
                <Avatar size="sm">
                  <AvatarFallback className="text-[10px] uppercase">
                    {project.author.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </span>
            </Field>
            <div className="min-w-0 sm:col-span-2">
              <dt className="mb-1 text-[13px] text-muted-foreground">Source</dt>
              <dd className="space-y-1">
                <p className="flex items-center gap-1.5 font-mono text-[13px]">
                  <GitBranchIcon className="size-4 shrink-0" />
                  {project.branch}
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                  <GitCommitIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 font-mono text-[13px]">
                    {project.sha}
                  </span>
                  <span className="truncate">{project.commit}</span>
                </p>
              </dd>
            </div>
          </dl>
        </div>

        <details className="group border-t">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium tracking-[-0.02em] select-none [&::-webkit-details-marker]:hidden">
            <CaretRightIcon className="size-4 transition-transform group-open:rotate-90" />
            Runtime Settings
          </summary>
          <dl className="grid gap-4 px-4 pb-4 sm:grid-cols-3">
            <Field label="Runtime">{project.runtime}</Field>
            <Field label="Start command">
              <code className="font-mono text-[13px] font-normal">
                {project.start}
              </code>
            </Field>
            <Field label="Port">
              <span className="tabular font-mono text-[13px] font-normal">
                {project.port}
              </span>
            </Field>
          </dl>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t bg-background-subtle px-4 py-3 text-muted-foreground">
          <p>
            To update your Production Deployment, push to the{" "}
            <code className="font-mono text-[13px] text-foreground">
              {project.branch}
            </code>{" "}
            branch.
          </p>
          <Link
            href={`/projects/${slug}/deployments`}
            className={cn(buttonVariants({ variant: "outline" }), "px-3")}
          >
            Deployments
          </Link>
        </div>
      </section>

      {/* Three summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <section
          aria-labelledby="resources-heading"
          className="rounded-lg bg-card p-4 shadow-border-small"
        >
          <h2
            id="resources-heading"
            className="mb-3 font-medium tracking-[-0.02em]"
          >
            Container
          </h2>
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">CPU</dt>
              <dd className="tabular font-mono text-[13px]">0.4 / 2 vCPU</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Memory</dt>
              <dd className="tabular font-mono text-[13px]">1.1 / 2 GB</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Disk</dt>
              <dd className="tabular font-mono text-[13px]">6.8 / 16 GB</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-subtle-foreground">Sample data</p>
        </section>

        <section
          aria-labelledby="traffic-heading"
          className="rounded-lg bg-card p-4 shadow-border-small"
        >
          <h2
            id="traffic-heading"
            className="mb-3 font-medium tracking-[-0.02em]"
          >
            Traffic <span className="font-normal text-muted-foreground">6h</span>
          </h2>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[13px] text-muted-foreground">Requests</p>
              <p className="tabular text-xl font-semibold tracking-[-0.02em]">
                1,284
              </p>
            </div>
            <Sparkline
              values={[2, 4, 3, 8, 5, 12, 6, 9, 14, 7, 10, 6]}
              className="h-8 w-28"
            />
          </div>
          <p className="mt-3 text-[12px] text-subtle-foreground">Sample data</p>
        </section>

        <section
          aria-labelledby="health-heading"
          className="rounded-lg bg-card p-4 shadow-border-small"
        >
          <h2
            id="health-heading"
            className="mb-3 font-medium tracking-[-0.02em]"
          >
            Health check
          </h2>
          <p className="flex items-center gap-2">
            <StatusDot state={project.state === "error" ? "error" : "ready"} />
          </p>
          <p className="mt-1 text-muted-foreground">
            GET / on port {project.port}, every 30 seconds.
          </p>
          <p className="mt-3 text-[12px] text-subtle-foreground">Sample data</p>
        </section>
      </div>

      {/* Active branches */}
      <section aria-labelledby="branches-heading">
        <h2
          id="branches-heading"
          className="mb-3 text-xl font-semibold tracking-[-0.02em]"
        >
          Active Branches
        </h2>
        <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
          {branches.map((d) => (
            <li
              key={d.branch}
              className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ds-gray-100)]/60"
            >
              <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Link
                href={`/projects/${slug}/deployments/${d.id}`}
                className="min-w-0 flex-1 truncate font-mono text-[13px] after:absolute after:inset-0 after:content-['']"
              >
                {d.branch}
              </Link>
              <StatusDot state={d.state} showLabel={false} />
              <span className="hidden font-mono text-[13px] text-muted-foreground sm:inline">
                {d.id}
              </span>
              <span className="shrink-0 text-muted-foreground">{d.age}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ProjectPage({ params }: Props) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}
