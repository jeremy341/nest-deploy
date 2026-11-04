"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

const itemClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium tracking-[-0.02em] outline-none transition-colors";

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

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {ctx.project ? (
        <>
          <Link
            href="/projects"
            onClick={onNavigate}
            className={cn(
              itemClass,
              "text-muted-foreground hover:bg-[var(--ds-gray-100)] hover:text-foreground",
              roomy && "h-10"
            )}
          >
            <CaretLeftIcon className="size-4 shrink-0" />
            {ctx.backLabel}
          </Link>
          <p className="truncate px-2 pt-3 pb-1 text-[12px] text-subtle-foreground">
            {ctx.project.name}
          </p>
        </>
      ) : null}

      {ctx.items.map((item) => {
        const active = item.active(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              itemClass,
              roomy && "h-10",
              active
                ? "bg-[var(--ds-gray-200)] text-foreground"
                : "text-muted-foreground hover:bg-[var(--ds-gray-100)] hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" weight={active ? "fill" : "regular"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex h-8 items-center gap-2.5 px-2">
          <span className="skeleton-sweep size-4 rounded-sm" />
          <span className="skeleton-sweep h-3 w-24 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
