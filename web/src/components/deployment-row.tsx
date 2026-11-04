import Link from "next/link";
import { GitBranchIcon } from "@phosphor-icons/react/dist/ssr";
import { DeploymentActions } from "@/components/deployment-actions";
import { StatusDot } from "@/components/status-dot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { projectName, type Deployment } from "@/lib/mock";

export function DeploymentRow({
  deployment,
  showProject = true,
}: {
  deployment: Deployment;
  showProject?: boolean;
}) {
  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_120px_minmax(0,1.6fr)_auto_32px] md:items-center">
      <div className="min-w-0">
        {showProject ? (
          <Link
            href={`/projects/${deployment.projectSlug}`}
            className="font-medium hover:underline"
          >
            {projectName(deployment.projectSlug)}
          </Link>
        ) : null}
        <div className="flex items-center gap-2">
          <code className="font-mono text-[12px] text-muted-foreground">
            {deployment.id}
          </code>
          <Badge variant="outline" className="font-normal">
            {deployment.env}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <StatusDot state={deployment.state} />
        <span className="text-[12px] text-muted-foreground">
          {deployment.duration}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px]">{deployment.commit}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate font-mono">{deployment.branch}</span>
        </p>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>{deployment.age}</span>
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] uppercase">
            {deployment.author.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="justify-self-end">
        <DeploymentActions id={deployment.id} />
      </div>
    </li>
  );
}
