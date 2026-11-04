import Link from "next/link";
import {
  ArrowFatLineUpIcon,
  EyeIcon,
  GitBranchIcon,
  GitCommitIcon,
} from "@phosphor-icons/react/dist/ssr";
import { DeploymentActions } from "@/components/deployment-actions";
import { StatusDot } from "@/components/status-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { DeploymentView } from "@/server/queries";
import { cn } from "@/lib/utils";

function EnvPill({ deployment }: { deployment: DeploymentView }) {
  const current = deployment.isCurrent;
  const Icon = deployment.env === "preview" ? EyeIcon : ArrowFatLineUpIcon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium tracking-[-0.02em]",
        current
          ? "bg-brand text-brand-foreground"
          : "shadow-border-base bg-background"
      )}
    >
      <Icon className="size-3.5" weight={current ? "fill" : "regular"} />
      {deployment.env === "preview" ? "Preview" : "Production"}
    </span>
  );
}

/**
 * One deployment. A grid on md and up, a stacked card on phones.
 * The whole row is one link (stretched over the commit text); the actions
 * menu sits above it.
 */
export function DeploymentRow({
  deployment,
  showProject = true,
  demo = false,
}: {
  deployment: DeploymentView;
  showProject?: boolean;
  /** Sample data on the homepage: no links and no actions menu. */
  demo?: boolean;
}) {
  const href = `/projects/${deployment.projectSlug}/deployments/${deployment.id}`;
  const title = deployment.commit ?? `${deployment.source} deployment`;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-3 transition-colors",
        !demo && "hover:bg-[var(--ds-gray-100)]/60",
        showProject
          ? "md:grid-cols-[150px_minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]"
          : "md:grid-cols-[minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]",
        "md:items-center"
      )}
    >
      {showProject ? (
        <p className="relative z-10 hidden min-w-0 md:block">
          <Link
            href={`/projects/${deployment.projectSlug}`}
            className="truncate font-medium tracking-[-0.02em] hover:underline"
          >
            {deployment.projectName}
          </Link>
        </p>
      ) : null}

      <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
        <p className="min-w-0 truncate">
          {showProject ? (
            <span className="mr-2 font-medium tracking-[-0.02em] md:hidden">
              {deployment.projectName}
            </span>
          ) : null}
          {demo ? (
            title
          ) : (
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          )}
        </p>
        <StatusDot state={deployment.state} className="shrink-0" />
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:contents">
          <span>
            <EnvPill deployment={deployment} />
          </span>
          <p className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden font-mono text-[13px] text-muted-foreground">
            <span className="flex shrink-0 items-center gap-1">
              <GitCommitIcon className="size-4 shrink-0" />
              {(deployment.sha ?? deployment.id).slice(0, 7)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <GitBranchIcon className="size-4 shrink-0" />
              <span className="truncate">{deployment.branch}</span>
            </span>
          </p>
        </div>
        <p className="flex shrink-0 items-center justify-end gap-2 text-muted-foreground">
          <span className="whitespace-nowrap">{deployment.age}</span>
          <Avatar size="sm">
            <AvatarFallback className="text-[10px] uppercase">
              {(deployment.author ?? "?").slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </p>
      </div>

      <div className="relative z-10 hidden justify-self-end md:block">
        {demo ? null : <DeploymentActions deployment={deployment} />}
      </div>
    </li>
  );
}
