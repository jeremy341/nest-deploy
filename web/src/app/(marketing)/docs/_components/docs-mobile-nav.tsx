"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { sectionTitle } from "../_data/nav";
import { DocsNavBody, useCurrentDocsPage } from "./docs-nav";

/**
 * Below lg the rail is gone. A bar sticks under the site header and always
 * names the current page; pressing it opens the list of pages.
 */
export function DocsMobileNav() {
  const current = useCurrentDocsPage();
  const [open, setOpen] = useState(false);
  // Only a pointer opens with a motion; the keyboard gets it instantly.
  const [animate, setAnimate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="sticky top-14 z-40 border-b bg-background lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          setAnimate(e.detail > 0);
          setOpen((v) => !v);
        }}
        className="mx-auto flex h-12 w-full max-w-[1200px] items-center gap-3 px-4 text-left -outline-offset-2 sm:px-6"
      >
        <span className="shrink-0 text-label text-muted-foreground">Docs</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{current ? sectionTitle(current) : "Overview"}</span>
        <CaretDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-base) ease-snappy",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className={cn(
            "absolute inset-x-0 top-full max-h-[70dvh] overflow-y-auto overscroll-contain border-b bg-background shadow-menu",
            animate &&
              "transition-[opacity,translate] duration-[180ms] ease-snappy starting:-translate-y-1 starting:opacity-0"
          )}
        >
          <nav aria-label="Docs" className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6">
            <DocsNavBody variant="panel" onNavigate={close} />
          </nav>
        </div>
      ) : null}
    </div>
  );
}
