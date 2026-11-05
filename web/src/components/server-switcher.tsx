"use client";

import Link from "next/link";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useAccount } from "@/components/account-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PixelAvatar } from "@/components/ui/pixel-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** The Nest server picker. Plays the role of Vercel's team switcher. */
export function ServerSwitcher({ className }: { className?: string }) {
  const { servers } = useAccount();
  const current = servers[0];
  const label = current?.nestUsername ?? "No server";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Server: ${label}`}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left font-medium tracking-[-0.02em] transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] aria-expanded:bg-[var(--ds-gray-alpha-100)] focus-visible:outline-offset-[-2px]",
          className
        )}
      >
        {current ? (
          <PixelAvatar seed={current.nestUsername} size={20} />
        ) : (
          <Avatar size="sm">
            <AvatarFallback className="text-[10px] font-medium">+</AvatarFallback>
          </Avatar>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <CaretUpDownIcon aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Nest servers</DropdownMenuLabel>
          {servers.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground">Nothing connected yet.</p>
          ) : (
            servers.map((s, i) => (
              <DropdownMenuItem key={s.id} render={<Link href="/connect" />}>
                <PixelAvatar seed={s.nestUsername} size={20} />
                <span className="truncate">{s.host === "hackclub.app" ? `${s.nestUsername}.hackclub.app` : s.host}</span>
                {i === 0 ? <CheckIcon className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))
          )}
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
