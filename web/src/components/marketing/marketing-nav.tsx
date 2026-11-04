"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/** True when `href` is the page the visitor is on (only /docs is a separate page). */
export function isCurrent(pathname: string, href: string): boolean {
  return !href.includes("#") && (pathname === href || pathname.startsWith(`${href}/`));
}

const linkClass =
  "py-2 text-[14px] text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground aria-[current=page]:text-foreground";

/**
 * The header links on md and wider. A client component only so the Docs link
 * can mark itself as the current page.
 */
export function MarketingNav({ items, repoUrl }: { items: NavItem[]; repoUrl: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden items-center gap-5 md:flex lg:gap-6">
      {items.map((n) => {
        const current = isCurrent(pathname, n.href);
        return n.href.includes("#") ? (
          <a key={n.href} href={n.href} className={linkClass}>
            {n.label}
          </a>
        ) : (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current ? "page" : undefined}
            className={linkClass}
          >
            {n.label}
          </Link>
        );
      })}
      <a href={repoUrl} target="_blank" rel="noreferrer" className={`${linkClass} hidden lg:inline`}>
        GitHub
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </nav>
  );
}
