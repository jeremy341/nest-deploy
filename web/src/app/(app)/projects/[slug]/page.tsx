import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRightIcon,
  CaretRightIcon,
  GitBranchIcon,
  GitCommitIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { CommitLink } from "@/components/commit-link";
import { DeployButton } from "@/components/deploy-button";
import { RollbackButton } from "@/components/rollback-button";
import { ProjectResources } from "@/components/project-resources";
import { PageHeader } from "@/components/page-header";
import { ServiceCard } from "@/components/service-status";
import { ProjectOverviewSkeleton } from "@/components/skeletons/project-overview";
import { StatusDot, StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PixelAvatar } from "@/components/ui/pixel-avatar";
import type { UiState } from "@/lib/status";
import { requireUser } from "@/server/auth/current";
import { deploymentViews, projectMetrics, projectViews, serverViews } from "@/server/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: slug };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-label text-muted-foreground">{label}</dt>
      <dd className="font-medium tracking-[-0.02em]">{children}</dd>
    </div>
  );
}

const LIVE_LABEL: Record<UiState, string> = {
  ready: "Ready",
  building: "Building",
  error: "Error",
  queued: "Queued",
  canceled: "Canceled",
};

const LIVE_TONE: Record<UiState, "ready" | "building" | "error" | "neutral"> = {
  ready: "ready",
  building: "building",
  error: "error",
  queued: "neutral",
  canceled: "neutral",
};

async function ProjectContent({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const project = (await projectViews(user.id)).find((p) => p.slug === slug);
  if (!project) notFound();

  const [history, servers, metrics] = await Promise.all([
    deploymentViews(user.id, { projectId: project.id }),
    serverViews(user.id),
    projectMetrics(user.id, project.id),
  ]);
  const server = servers.find((s) => s.id === project.serverId);

  const live = history.find((d) => d.env === "production" && d.isCurrent) ?? null;
  const latest = history[0] ?? null;
  const rollbackTarget =
    history.find(
      (d) =>
        d.env === "production" &&
        d.rawState === "ready" &&
        !d.isCurrent &&
        !d.cleanedUp
    ) ?? null;
  const branches = history.filter(
    (d, i) => history.findIndex((x) => x.branch === d.branch) === i
  );
  const address = project.domains[0];

  return (
    <div className="motion-enter space-y-6">
      <PageHeader
        leading={<PixelAvatar seed={slug} size={40} />}
        title={project.name}
        description={
          address ? (
            <a href={`https://${address}`} target="_blank" rel="noreferrer" className="link">
              {address}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <>
              Port <span className="font-mono">{project.port}</span>
            </>
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open repository on GitHub"
              render={<a href={project.repoUrl} target="_blank" rel="noreferrer" />}
            >
              <GithubLogoIcon aria-hidden="true" />
            </Button>
            <RollbackButton targetId={rollbackTarget?.id ?? null} projectSlug={slug} />
            <DeployButton
              projectId={project.id}
              projectSlug={slug}
              label={live ? "Redeploy" : "Deploy"}
              variant={address ? "outline" : "default"}
            />
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
          </>
        }
      />

      {latest?.state === "error" ? (
        <Alert tone="error" role="status">
          The latest deployment failed
          {live ? ", and the previous release is still serving traffic" : ""}.{" "}
          <Link href={`/projects/${slug}/deployments/${latest.id}`} className="link font-medium">
            See the log
          </Link>
          .
        </Alert>
      ) : null}

      <section
        aria-labelledby="production-heading"
        className="overflow-hidden rounded-lg bg-card shadow-border-small"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="production-heading" className="text-title-3">
            Production Deployment
          </h2>
          {live ? (
            <StatusIndicator
              tone={LIVE_TONE[live.state]}
              pending={live.state === "building" || live.state === "queued"}
              label={LIVE_LABEL[live.state]}
            />
          ) : null}
        </div>

        {live ? (
          <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Deployment">
              <Link
                href={`/projects/${slug}/deployments/${live.id}`}
                className="link font-mono text-[13px] font-normal"
              >
                {live.id.slice(0, 8)}
              </Link>
            </Field>
            <Field label="Status">
              <StatusDot state={live.state} />
            </Field>
            <Field label="Created">
              <span className="inline-flex items-center gap-2">
                {live.age}
                <Avatar size="sm">
                  <AvatarFallback className="text-[10px] uppercase">
                    {(live.author ?? "?").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              </span>
            </Field>
            <Field label="Address">
              {address ? (
                <a
                  href={`https://${address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link break-all"
                >
                  {address}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="font-normal text-muted-foreground">
                  Port <span className="font-mono">{project.port}</span>.{" "}
                  <Link href="/domains" className="link">
                    Add a domain
                  </Link>
                </span>
              )}
            </Field>
            <div className="min-w-0 sm:col-span-2">
              <dt className="mb-1 text-label text-muted-foreground">Source</dt>
              <dd className="space-y-1">
                <p className="flex items-center gap-1.5 font-mono text-[13px]">
                  <GitBranchIcon aria-hidden="true" className="size-4 shrink-0" />
                  {live.branch}
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                  <GitCommitIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <CommitLink repo={live.repo} sha={live.sha} className="shrink-0 font-mono text-[13px]" />
                  <span className="truncate">{live.commit}</span>
                </p>
              </dd>
            </div>
          </dl>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="font-medium">Nothing is live yet</p>
            <p className="mx-auto mt-1 max-w-[46ch] text-muted-foreground">
              Press Deploy to build <span className="font-mono text-[13px]">{project.branch}</span>{" "}
              and start it on {project.nestUsername}.hackclub.app.
            </p>
          </div>
        )}

        <details className="disclosure border-t">
          <summary className="items-center gap-2 px-4 py-3 font-medium tracking-[-0.02em] select-none">
            <CaretRightIcon aria-hidden="true" className="disclosure-caret size-4" />
            Runtime Settings
          </summary>
          <dl className="grid gap-4 px-4 pb-4 sm:grid-cols-4">
            <Field label="Runtime">{project.runtime}</Field>
            <Field label="Start command">
              <code className="font-mono text-[13px] font-normal">
                {project.startCommand ?? "default"}
              </code>
            </Field>
            <Field label="Port">
              <span className="tabular font-mono text-[13px] font-normal">{project.port}</span>
            </Field>
            <Field label="Branch">
              <span className="font-mono text-[13px] font-normal">{project.branch}</span>
            </Field>
          </dl>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background-subtle px-4 py-3 text-muted-foreground">
          <p>
            {project.autoDeploy ? (
              <>
                Pushes to{" "}
                <code className="font-mono text-[13px] text-foreground">{project.branch}</code>{" "}
                deploy automatically.
              </>
            ) : (
              "Automatic deploys are off for this project."
            )}
          </p>
          <Button
            variant="outline"
            className="px-3"
            render={<Link href={`/projects/${slug}/deployments`} />}
          >
            Deployments
          </Button>
        </div>
      </section>

      {live ? <ServiceCard projectId={project.id} /> : null}
      {live ? <ProjectResources points={metrics} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="domains-heading" className="h-full rounded-lg bg-card p-4 shadow-border-small">
          <h2 id="domains-heading" className="mb-3 text-title-3">
            Domains
          </h2>
          {project.domains.length === 0 ? (
            <p className="text-muted-foreground">
              None yet. Map a domain to port{" "}
              <span className="font-mono text-[13px]">{project.port}</span> in the Nest
              dashboard, then{" "}
              <Link href="/domains" className="link">
                record it here
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-1.5">
              {project.domains.map((d) => (
                <li key={d} className="truncate">
                  {d}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="container-heading" className="h-full rounded-lg bg-card p-4 shadow-border-small">
          <h2 id="container-heading" className="mb-3 text-title-3">
            Container
          </h2>
          {server?.usage ? (
            <dl className="space-y-2">
              {server.usage.cpuLoad !== null && server.usage.cpus ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">CPU load</dt>
                  <dd className="tabular font-mono text-[13px]">
                    {server.usage.cpuLoad.toFixed(2)} / {server.usage.cpus}
                  </dd>
                </div>
              ) : null}
              {server.usage.memUsedMb !== null && server.usage.memTotalMb ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Memory</dt>
                  <dd className="tabular font-mono text-[13px]">
                    {(server.usage.memUsedMb / 1024).toFixed(1)} /{" "}
                    {(server.usage.memTotalMb / 1024).toFixed(1)} GB
                  </dd>
                </div>
              ) : null}
              {server.usage.diskUsedMb !== null && server.usage.diskTotalMb ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Disk</dt>
                  <dd className="tabular font-mono text-[13px]">
                    {(server.usage.diskUsedMb / 1024).toFixed(1)} /{" "}
                    {(server.usage.diskTotalMb / 1024).toFixed(1)} GB
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-muted-foreground">Not checked yet.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="branches-heading">
        <h2 id="branches-heading" className="mb-3 text-title-2">
          Active Branches
        </h2>
        {branches.length === 0 ? (
          <div className="rounded-lg bg-card px-4 shadow-border-small">
            <EmptyState
              size="compact"
              icon={<GitBranchIcon />}
              title="Branches appear here after their first deployment."
            />
          </div>
        ) : (
          <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
            {branches.map((d) => (
              <li
                key={d.branch}
                className="row-focus relative flex items-center gap-3 px-4 py-3 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
              >
                <GitBranchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/projects/${slug}/deployments/${d.id}`}
                  className="min-w-0 flex-1 truncate font-mono text-[13px] after:absolute after:inset-0 after:content-['']"
                >
                  {d.branch}
                </Link>
                <StatusDot state={d.state} showLabel={false} />
                <span className="hidden font-mono text-[13px] text-muted-foreground sm:inline-flex">
                  {d.sha ? <CommitLink repo={d.repo} sha={d.sha} /> : d.id.slice(0, 7)}
                </span>
                <span className="shrink-0 text-muted-foreground">{d.age}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ProjectPage({ params }: Props) {
  return (
    <Suspense fallback={<ProjectOverviewSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}
