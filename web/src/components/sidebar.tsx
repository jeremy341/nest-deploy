"use client";

import { Suspense } from "react";
import { BookOpenIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useFind } from "@/components/find-palette";
import { NavList, NavListSkeleton } from "@/components/nav-list";
import { ServerSwitcher } from "@/components/server-switcher";
import { UserMenu } from "@/components/user-menu";

export function FindButton({ className }: { className?: string }) {
  const { open } = useFind();
  return (
    <button
      type="button"
      onClick={open}
      aria-keyshortcuts="F"
      className={
        className ??
        "shadow-border-base flex h-8 w-full items-center gap-2 rounded-md bg-background px-2 text-left text-muted-foreground outline-none transition-colors hover:text-foreground"
      }
    >
      <MagnifyingGlassIcon className="size-4 shrink-0" />
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
      <div className="flex flex-col gap-2 p-2 pb-0">
        <ServerSwitcher />
        <FindButton />
      </div>

      <div className="flex-1 overflow-y-auto p-2 pt-3">
        <Suspense fallback={<NavListSkeleton />}>
          <NavList />
        </Suspense>
      </div>

      <div className="flex flex-col gap-0.5 border-t p-2">
        <a
          href="https://guides.hackclub.app"
          target="_blank"
          rel="noreferrer"
          className="flex h-8 items-center gap-2.5 rounded-md px-2 font-medium tracking-[-0.02em] text-muted-foreground transition-colors hover:bg-[var(--ds-gray-100)] hover:text-foreground"
        >
          <BookOpenIcon className="size-4 shrink-0" />
          Nest guides
        </a>
        <UserMenu />
      </div>
    </aside>
  );
}
