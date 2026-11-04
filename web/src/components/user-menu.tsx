"use client";

import Link from "next/link";
import { BookOpenIcon, PlusIcon, SignOutIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { server } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** Account row at the bottom of the sidebar. */
export function UserMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Signed in as {server.username}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/connect" />}>
          <PlusIcon />
          Connect a server
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a
              href="https://guides.hackclub.app"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <BookOpenIcon />
          Nest guides
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-sm">Theme</span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/login" />}>
          <SignOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
