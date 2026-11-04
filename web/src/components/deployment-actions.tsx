"use client";

import Link from "next/link";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  DotsThreeIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DeploymentActions({ id }: { id: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for deployment ${id}`}
          />
        }
      >
        <DotsThreeIcon weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem render={<Link href="/logs" />}>
          <TerminalWindowIcon />
          View logs
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ArrowsClockwiseIcon />
          Redeploy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <ArrowCounterClockwiseIcon />
          Instant rollback
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
