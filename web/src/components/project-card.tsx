import Link from "next/link";
import {
  GitCommitIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { StatusDot } from "@/components/status-dot";
import type { Project } from "@/lib/mock";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex h-full flex-col gap-4 rounded-lg bg-card p-4 shadow-border-small outline-none transition-shadow hover:shadow-menu"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background uppercase"
        >
          {project.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium tracking-[-0.02em]">
            {project.name}
          </p>
          <p className="truncate text-muted-foreground">{project.domain}</p>
        </div>
        <StatusDot state={project.state} showLabel={false} className="pt-2" />
      </div>

      <p className="flex min-w-0 items-center gap-2">
        <GitCommitIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{project.commit}</span>
      </p>

      <p className="mt-auto flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <GithubLogoIcon className="size-4 shrink-0" />
        <span className="truncate">{project.repo}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{project.age}</span>
      </p>
    </Link>
  );
}
