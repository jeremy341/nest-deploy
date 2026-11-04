"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ListIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useFind } from "@/components/find-palette";
import { NavList, NavListSkeleton } from "@/components/nav-list";
import { ServerSwitcher } from "@/components/server-switcher";
import { UserMenu } from "@/components/user-menu";

/**
 * Phone navigation: a floating Find / menu pill at the bottom, and a
 * full-screen menu. The sidebar is hidden below the lg breakpoint.
 */
export function MobileDock() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { open: openFind } = useFind();

  return (
    <div className="lg:hidden">
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center">
        <div className="shadow-menu pointer-events-auto flex h-11 items-center rounded-xl bg-background">
          <button
            type="button"
            onClick={openFind}
            className="flex h-full items-center gap-2 rounded-l-xl pr-4 pl-4 font-medium text-muted-foreground"
          >
            <MagnifyingGlassIcon className="size-4" />
            Find
          </button>
          <span aria-hidden="true" className="h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-full w-12 items-center justify-center rounded-r-xl"
          >
            {menuOpen ? (
              <XIcon className="size-5" />
            ) : (
              <ListIcon className="size-5" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? <Menu onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const first = useRef(pathname);

  useEffect(() => {
    if (first.current !== pathname) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex animate-in flex-col overflow-y-auto bg-background-subtle px-3 pt-3 pb-24 duration-200 fade-in-0"
    >
      <ServerSwitcher />
      <div className="mt-4">
        <Suspense fallback={<NavListSkeleton />}>
          <NavList roomy onNavigate={onClose} />
        </Suspense>
      </div>
      <div className="mt-auto border-t pt-3">
        <UserMenu />
      </div>
    </div>
  );
}
