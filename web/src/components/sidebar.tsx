"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  BookOpenTextIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useFind } from "@/components/find-palette";
import { NestMark } from "@/components/nest-mark";
import {
  NavList,
  NavListSkeleton,
  navItemClass,
  navItemIdle,
} from "@/components/nav-list";
import { ServerSwitcher } from "@/components/server-switcher";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

export function FindButton({ className }: { className?: string }) {
  const { open } = useFind();
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-keyshortcuts="F"
      className={cn(
        "shadow-border-base flex h-8 w-full items-center gap-2 rounded-md bg-background px-2 text-left text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground",
        className
      )}
    >
      <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex-1">Find</span>
      <kbd className="rounded-sm border px-1.5 font-mono text-[11px] leading-4">
        F
      </kbd>
    </button>
  );
}

/** Desktop sidebar: 256px, fixed to the viewport, sits left of the page. */
export function Sidebar() {
  return (
    <aside
      aria-label="Sidebar"
      className="sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-background-subtle lg:flex"
    >
      {/* 56px, so its hairline continues the top bar's. */}
      <div className="flex h-[var(--topbar-height)] shrink-0 items-center gap-1 border-b px-2">
        <Link
          href="/projects"
          aria-label="Nest Deploy home"
          className="flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
        >
          <NestMark className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <ServerSwitcher />
        </div>
      </div>

      <div className="p-2 pb-0">
        <FindButton />
      </div>

      <div className="flex-1 overflow-y-auto p-2 pt-3">
        <Suspense fallback={<NavListSkeleton />}>
          <NavList />
        </Suspense>
      </div>

      <div className="flex flex-col gap-0.5 border-t p-2">
        <Link href="/docs" className={cn(navItemClass, navItemIdle)}>
          <BookOpenTextIcon aria-hidden="true" className="size-4 shrink-0" />
          Docs
        </Link>
        <a
          href="https://guides.hackclub.app"
          target="_blank"
          rel="noreferrer"
          className={cn(navItemClass, navItemIdle)}
        >
          <BookOpenIcon aria-hidden="true" className="size-4 shrink-0" />
          Nest guides
          <ArrowUpRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-subtle-foreground"
          />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <UserMenu />
      </div>
    </aside>
  );
}
