"use client";

import Link from "next/link";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { server } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** The Nest server picker. Plays the role of Vercel's team switcher. */
export function ServerSwitcher({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Server: ${server.username}`}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left font-medium tracking-[-0.02em] outline-none transition-colors hover:bg-[var(--ds-gray-100)] aria-expanded:bg-[var(--ds-gray-100)]",
          className
        )}
      >
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-medium uppercase">
            {server.username.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate">{server.username}</span>
        <Badge variant="outline" className="font-normal">
          Nest
        </Badge>
        <CaretUpDownIcon className="size-4 shrink-0 text-subtle-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Nest servers</DropdownMenuLabel>
          <DropdownMenuItem>
            <Avatar size="sm">
              <AvatarFallback className="text-[10px] font-medium uppercase">
                {server.username.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{server.host}</span>
            <CheckIcon className="ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/connect" />}>
          <PlusIcon />
          Connect a server
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
