"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  DotsThreeIcon,
  ProhibitIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { isActive } from "@/lib/status";

export type ActionableDeployment = {
  id: string;
  projectSlug: string;
  env: "production" | "preview";
  rawState: string;
  isCurrent: boolean;
  cleanedUp: boolean;
};

/** Redeploy, roll back, cancel. Each calls the API and refreshes the page. */
export function DeploymentActions({ deployment }: { deployment: ActionableDeployment }) {
  const router = useRouter();
  const d = deployment;

  async function run(action: "redeploy" | "rollback" | "cancel") {
    try {
      const res = await api<{ deployment: { id: string } | null }>(
        `/api/deployments/${d.id}/${action}`,
        { method: "POST" }
      );
      if (res.deployment && action !== "cancel") {
        router.push(`/projects/${d.projectSlug}/deployments/${res.deployment.id}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const canRollback =
    d.env === "production" && d.rawState === "ready" && !d.isCurrent && !d.cleanedUp;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for deployment ${d.id.slice(0, 7)}`}
            />
          }
        >
          <DotsThreeIcon aria-hidden="true" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            render={<Link href={`/projects/${d.projectSlug}/deployments/${d.id}`} />}
          >
            <TerminalWindowIcon />
            View logs
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run("redeploy")}>
            <ArrowsClockwiseIcon />
            Redeploy
          </DropdownMenuItem>
          {canRollback ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void run("rollback")}>
                <ArrowCounterClockwiseIcon />
                Instant rollback
              </DropdownMenuItem>
            </>
          ) : null}
          {isActive(d.rawState) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void run("cancel")}>
                <ProhibitIcon />
                Cancel
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
