"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRightIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { isCurrent, type NavItem } from "@/components/marketing/marketing-nav";

const row =
  "flex h-11 items-center gap-2 px-6 text-[15px] text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground aria-[current=page]:text-foreground";

/**
 * The header menu below md: a 40px button and a panel under the header with
 * every destination, so docs and the dashboard are reachable on a phone.
 * Closes on a link click, Esc (focus goes back to the button) and a click
 * outside. The panel is always in the DOM and toggled with `hidden`, so it
 * adds no layout shift and its entrance plays each time it opens.
 */
export function MobileMenu({
  items,
  repoUrl,
}: {
  items: NavItem[];
  repoUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || button.current?.contains(t)) return;
      setOpen(false);
    };
    // The panel is for narrow screens; close it if the window grows past md.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((o) => !o)}
        className="pressable inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--ds-gray-100)] hover:text-foreground md:hidden"
      >
        {open ? <XIcon aria-hidden="true" className="size-[18px]" /> : <ListIcon aria-hidden="true" className="size-[18px]" />}
      </button>

      <nav
        ref={panel}
        id="site-menu"
        aria-label="Site menu"
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
        style={{ animationDuration: "180ms" }}
        className="motion-enter absolute inset-x-0 top-14 border-b bg-background-subtle py-2 shadow-menu md:hidden"
      >
        {items.map((n) =>
          n.href.includes("#") ? (
            <a key={n.href} href={n.href} className={row}>
              {n.label}
            </a>
          ) : (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(pathname, n.href) ? "page" : undefined}
              className={row}
            >
              {n.label}
            </Link>
          )
        )}
        <a href={repoUrl} target="_blank" rel="noreferrer" className={row}>
          GitHub
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-subtle-foreground" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <div className="mt-2 border-t pt-2">
          <Link href="/login" className={row}>
            Log in
          </Link>
          <Link href="/projects" className={row}>
            Dashboard
          </Link>
        </div>
      </nav>
    </>
  );
}
