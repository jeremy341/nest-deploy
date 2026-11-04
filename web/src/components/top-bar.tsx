"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CaretLeftIcon,
  CaretUpDownIcon,
  PlusIcon,
  TriangleIcon,
} from "@phosphor-icons/react";
import { NestMark } from "@/components/nest-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navFor } from "@/lib/nav";

export function TopBar() {
  const pathname = usePathname();
  const ctx = navFor(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] shrink-0 items-center border-b bg-background-subtle px-4 lg:px-6">
      {/* Left: back chevron on phones, breadcrumb on desktop */}
      <div className="flex min-w-0 items-center gap-2">
        {ctx.backHref ? (
          <Link
            href={ctx.backHref}
            aria-label="Back"
            className="-ml-2 flex size-9 items-center justify-center rounded-md text-foreground hover:bg-[var(--ds-gray-100)] lg:hidden"
          >
            <CaretLeftIcon className="size-5" />
          </Link>
        ) : (
          <Link
            href="/projects"
            aria-label="Nest Deploy home"
            className="-ml-1 rounded-md p-1 lg:hidden"
          >
            <NestMark className="size-6" />
          </Link>
        )}

        <div className="hidden min-w-0 items-center gap-2 font-medium tracking-[-0.02em] lg:flex">
          {ctx.project ? (
            <Link
              href={`/projects/${ctx.project.slug}`}
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-[var(--ds-gray-100)]"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <TriangleIcon className="size-3" weight="fill" />
              </span>
              <span className="truncate">{ctx.project.name}</span>
              <CaretUpDownIcon className="size-4 shrink-0 text-subtle-foreground" />
            </Link>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-[var(--ds-gray-100)]"
            >
              All Projects
              <CaretUpDownIcon className="size-4 shrink-0 text-subtle-foreground" />
            </Link>
          )}
        </div>
      </div>

      {/* Centre: page title */}
      <p className="pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate font-medium tracking-[-0.02em]">
        {ctx.title}
      </p>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="hidden gap-1.5 px-2 font-medium tracking-[-0.02em] lg:inline-flex"
              />
            }
          >
            <PlusIcon />
            Create New
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem render={<Link href="/new" />}>
              Project
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/domains" />}>
              Domain
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/connect" />}>
              Connect a server
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="lg:hidden">
          <NestMark className="size-6" />
        </span>
      </div>
    </header>
  );
}

export function TopBarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-30 h-[var(--topbar-height)] shrink-0 border-b bg-background-subtle"
    />
  );
}
