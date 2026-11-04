import Link from "next/link";
import { GitBranchIcon, GithubLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { StatusDot } from "@/components/status-dot";
import type { Project } from "@/lib/mock";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex flex-col gap-4 rounded-lg border bg-card p-4 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-sm font-semibold uppercase"
        >
          {project.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{project.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {project.domain}
          </p>
        </div>
        <StatusDot state={project.state} showLabel={false} className="pt-1.5" />
      </div>

      <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]">
        <GithubLogoIcon className="size-3.5 shrink-0" />
        <span className="truncate">{project.repo}</span>
      </span>

      <div>
        <p className="truncate text-[13px]">{project.commit}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span>{project.age} on</span>
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate font-mono text-[12px]">
            {project.branch}
          </span>
        </p>
      </div>
    </Link>
  );
}
