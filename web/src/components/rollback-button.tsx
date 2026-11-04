"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Switch production back to an earlier release that is still on the server.
 * `targetId` is that earlier deployment, or null when there is none.
 */
export function RollbackButton({
  targetId,
  projectSlug,
}: {
  targetId: string | null;
  projectSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const hintId = useId();

  async function rollback() {
    if (!targetId) return;
    setBusy(true);
    try {
      const res = await api<{ deployment: { id: string } }>(
        `/api/deployments/${targetId}/rollback`,
        { method: "POST" }
      );
      router.push(`/projects/${projectSlug}/deployments/${res.deployment.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
      setBusy(false);
    }
  }

  const hint = targetId
    ? "Switches back to the previous release. Database changes are not reversed."
    : "There is no earlier release on your server to switch back to.";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              disabled={!targetId}
              loading={busy}
              aria-describedby={hintId}
              onClick={() => void rollback()}
              className="max-sm:size-10 max-sm:gap-0 max-sm:px-0"
            />
          }
        >
          <ArrowCounterClockwiseIcon aria-hidden="true" />
          <span className="max-sm:sr-only">{busy ? "Rolling back…" : "Instant rollback"}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">{hint}</TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </>
  );
}
