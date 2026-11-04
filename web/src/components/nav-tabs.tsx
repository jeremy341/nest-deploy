"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Projects" },
  { href: "/deployments", label: "Deployments" },
  { href: "/domains", label: "Domains" },
  { href: "/logs", label: "Logs" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/projects");
  return pathname.startsWith(href);
}

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-md px-3 py-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "font-medium text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
