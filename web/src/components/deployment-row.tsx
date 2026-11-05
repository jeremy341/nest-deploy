import Link from "next/link";
import {
  ArrowFatLineUpIcon,
  EyeIcon,
  GitBranchIcon,
  GitCommitIcon,
} from "@phosphor-icons/react/dist/ssr";
import { CommitLink } from "@/components/commit-link";
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
      <Icon aria-hidden="true" className="size-3.5" weight={current ? "fill" : "regular"} />
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
  selected = false,
  onSelectedChange,
}: {
  deployment: DeploymentView;
  showProject?: boolean;
  /** Sample data on the homepage: no links and no actions menu. */
  demo?: boolean;
  selected?: boolean;
  /** When given, the row shows a checkbox for compare and bulk actions. */
  onSelectedChange?: (checked: boolean) => void;
}) {
  const selectable = !demo && onSelectedChange !== undefined;
  const href = `/projects/${deployment.projectSlug}/deployments/${deployment.id}`;
  const title = deployment.commit ?? `${deployment.source} deployment`;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-3",
        selectable && "pl-12",
        selected && "bg-[var(--ds-gray-alpha-100)]",
        !demo &&
          "row-focus transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]",
        showProject
          ? "md:grid-cols-[150px_minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]"
          : "md:grid-cols-[minmax(0,1fr)_110px_120px_minmax(0,160px)_88px_32px]",
        "md:items-center"
      )}
    >
      {selectable ? (
        // The whole 44px strip is the target; it sits above the stretched link.
        <label className="absolute inset-y-0 left-0 z-10 flex w-11 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="size-4 cursor-pointer"
            checked={selected}
            onChange={(e) => onSelectedChange(e.target.checked)}
            aria-label={`Select deployment ${(deployment.sha ?? deployment.id).slice(0, 7)} of ${deployment.projectName}`}
          />
        </label>
      ) : null}

      {showProject ? (
        <p className="relative z-10 hidden min-w-0 md:block">
          <Link
            href={`/projects/${deployment.projectSlug}`}
            className="truncate font-medium tracking-[-0.02em] text-foreground underline-offset-4 hover:underline focus-visible:underline"
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
        {/* A finished, healthy release stays quiet; anything else keeps its full-weight word. */}
        <StatusDot
          state={deployment.state}
          className={cn("shrink-0", deployment.state === "ready" && "font-normal text-muted-foreground")}
        />
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:contents">
          <span>
            <EnvPill deployment={deployment} />
          </span>
          <p className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden font-mono md:gap-3 text-[13px] text-muted-foreground">
            <span className="flex shrink-0 items-center gap-1 max-md:hidden">
              <GitCommitIcon aria-hidden="true" className="size-4 shrink-0" />
              {deployment.sha ? (
                <CommitLink repo={deployment.repo} sha={deployment.sha} link={!demo} />
              ) : (
                deployment.id.slice(0, 7)
              )}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1 md:flex-none">
              <GitBranchIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{deployment.branch}</span>
            </span>
            {deployment.pr ? (
              <span className="shrink-0 rounded-sm bg-[var(--ds-gray-100)] px-1.5 py-0.5 text-[11px] leading-none text-foreground">
                PR #{deployment.pr}
              </span>
            ) : null}
          </p>
        </div>
        <p className="flex shrink-0 items-center justify-end gap-2 text-muted-foreground">
          <span className="tabular whitespace-nowrap">{deployment.age}</span>
          <Avatar size="sm" className="max-sm:hidden">
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
