"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
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
      window.alert(e instanceof Error ? e.message : "Rollback failed");
      setBusy(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            disabled={!targetId || busy}
            onClick={() => void rollback()}
          />
        }
      >
        <ArrowCounterClockwiseIcon />
        Instant rollback
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        {targetId
          ? "Switches back to the previous release. Database changes are not reversed."
          : "There is no earlier release on your server to switch back to."}
      </TooltipContent>
    </Tooltip>
  );
}
