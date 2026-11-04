"use client";

import Link from "next/link";
import { CaretUpDownIcon, CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function ServerSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-8 gap-2 px-2" />}
      >
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-medium uppercase">
            {server.username.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium">{server.username}</span>
        <Badge variant="outline" className="hidden font-normal sm:inline-flex">
          2 vCPU
        </Badge>
        <CaretUpDownIcon className="text-muted-foreground" />
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
