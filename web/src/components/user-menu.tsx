"use client";

import Link from "next/link";
import { BookOpenIcon, GearSixIcon, PlusIcon, SignOutIcon } from "@phosphor-icons/react";
import { initials, useAccount } from "@/components/account-context";
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
import { cn } from "@/lib/utils";

/** Account row at the bottom of the sidebar. */
export function UserMenu({ className }: { className?: string }) {
  const { user } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left font-medium tracking-[-0.02em] transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] aria-expanded:bg-[var(--ds-gray-alpha-100)] focus-visible:outline-offset-[-2px]",
          className
        )}
      >
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-medium uppercase">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Signed in as {user.name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <GearSixIcon />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/connect" />}>
          <PlusIcon />
          Connect a server
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a href="https://guides.hackclub.app" target="_blank" rel="noreferrer" />
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
        {/* A form POST, so logging out cannot be triggered by a link. */}
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-offset-[-2px] max-sm:min-h-10"
          >
            <SignOutIcon className="size-4" />
            Log out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
