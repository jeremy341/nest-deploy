import Link from "next/link";
import {
  GitCommitIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { StatusDot } from "@/components/status-dot";
import { PixelAvatar } from "@/components/ui/pixel-avatar";
import type { ProjectView } from "@/server/queries";

function commitText(project: ProjectView) {
  return (
    project.lastCommit ?? (project.state ? "Deployment in progress" : "Not deployed yet")
  );
}

/**
 * A project as a card (grid) or as a row in one shared list (`variant="row"`).
 * Both are a single link to the project. The row variant leaves the focus ring
 * to its `li` (see `.row-focus`).
 */
export function ProjectCard({
  project,
  variant = "card",
}: {
  project: ProjectView;
  variant?: "card" | "row";
}) {
  const address = project.domains[0] ?? `port ${project.port}`;
  const href = `/projects/${project.slug}`;

  if (variant === "row") {
    return (
      <Link
        href={href}
        className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
      >
        <PixelAvatar seed={project.slug} size={20} />
        <span className="min-w-0 flex-1 truncate font-medium tracking-[-0.02em]">
          {project.name}
        </span>
        <span className="hidden w-[24%] truncate text-label text-muted-foreground sm:block">
          {address}
        </span>
        <span className="hidden w-[28%] truncate text-muted-foreground md:block">
          {commitText(project)}
        </span>
        {project.lastAge ? (
          <span className="tabular hidden w-14 shrink-0 text-right text-label text-muted-foreground sm:block">
            {project.lastAge}
          </span>
        ) : null}
        <StatusDot state={project.state} showLabel={false} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="card-interactive flex h-full flex-col gap-4 rounded-lg bg-card p-4 shadow-border-small"
    >
      <div className="flex items-center gap-3">
        <PixelAvatar seed={project.slug} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium tracking-[-0.02em]">{project.name}</p>
          <p className="truncate text-label text-muted-foreground">{address}</p>
        </div>
        <StatusDot state={project.state} showLabel={false} />
      </div>

      <p className="flex min-w-0 items-center gap-2">
        <GitCommitIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {project.lastSha ? (
          <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
            {project.lastSha}
          </span>
        ) : null}
        <span className="truncate">{commitText(project)}</span>
      </p>

      <p className="mt-auto flex min-w-0 items-center gap-2 text-label text-muted-foreground">
        <GithubLogoIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">
          {project.repo ?? project.repoUrl.replace("https://github.com/", "")}
        </span>
        {project.lastAge ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{project.lastAge}</span>
          </>
        ) : null}
      </p>
    </Link>
  );
}
