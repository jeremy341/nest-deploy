"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RollbackButton() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        <ArrowCounterClockwiseIcon />
        Instant rollback
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        Switches back to the previous release. Database changes are not
        reversed.
      </TooltipContent>
    </Tooltip>
  );
}
