"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { useAccount } from "@/components/account-context";
import { PixelAvatar } from "@/components/ui/pixel-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Shared by every row of the sidebar and the phone menu. 32px tall, 44px in the phone menu. */
export const navItemClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium tracking-[-0.02em] transition-colors duration-(--dur-fast) focus-visible:outline-offset-[-2px]";
export const navItemIdle =
  "text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground";
export const navItemCurrent = "bg-[var(--ds-gray-200)] text-foreground";

/** Sidebar links. Switches to project links inside a project. */
export function NavList({
  onNavigate,
  roomy = false,
}: {
  onNavigate?: () => void;
  /** Larger rows for the phone menu. */
  roomy?: boolean;
}) {
  const pathname = usePathname();
  const ctx = navFor(pathname);
  const { projects } = useAccount();
  const projectName = ctx.project
    ? (projects.find((p) => p.slug === ctx.project?.slug)?.name ?? ctx.project.name)
    : null;

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {ctx.project ? (
        <>
          <Link
            href="/projects"
            onClick={onNavigate}
            data-menu-first={roomy ? "" : undefined}
            className={cn(navItemClass, navItemIdle, roomy && "h-11")}
          >
            <CaretLeftIcon aria-hidden="true" className="size-4 shrink-0" />
            {ctx.backLabel}
          </Link>
          <p className="flex items-center gap-2 px-2 pt-3 pb-1 text-[12px] text-subtle-foreground">
            <PixelAvatar seed={ctx.project.slug} size={16} />
            <span className="truncate">{projectName}</span>
          </p>
        </>
      ) : null}

      {ctx.items.map((item, i) => {
        const active = item.active(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-menu-first={roomy && !ctx.project && i === 0 ? "" : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              navItemClass,
              roomy && "h-11",
              active ? navItemCurrent : navItemIdle
            )}
          >
            <Icon
              aria-hidden="true"
              className="size-4 shrink-0"
              weight={active ? "fill" : "regular"}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Six rows, the same height as the real ones. */
export function NavListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-0.5">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-8 items-center gap-2.5 px-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
