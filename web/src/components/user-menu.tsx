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

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Avatar>
          <AvatarFallback className="text-xs font-medium uppercase">
            {server.username.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end">
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
