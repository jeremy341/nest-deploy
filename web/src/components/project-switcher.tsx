"use client";

import Link from "next/link";
import { CaretUpDownIcon, CheckIcon, PlusIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useAccount } from "@/components/account-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PixelAvatar } from "@/components/ui/pixel-avatar";

/** The project crumb in the top bar: shows the current project, lists the rest. */
export function ProjectSwitcher({ slug, name }: { slug: string; name: string }) {
  const { projects } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Project: ${name}. Switch project`}
        className="flex h-8 min-w-0 max-w-64 items-center gap-2 rounded-md px-2 font-medium tracking-[-0.02em] transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] aria-expanded:bg-[var(--ds-gray-alpha-100)]"
      >
        <PixelAvatar seed={slug} size={16} />
        <span className="truncate">{name}</span>
        <CaretUpDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-subtle-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.slug} render={<Link href={`/projects/${p.slug}`} />}>
              <PixelAvatar seed={p.slug} size={16} />
              <span className="truncate">{p.name}</span>
              {p.slug === slug ? (
                <CheckIcon aria-label="Current project" className="ml-auto" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/projects" />}>
          <SquaresFourIcon />
          All projects
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/new" />}>
          <PlusIcon />
          New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
