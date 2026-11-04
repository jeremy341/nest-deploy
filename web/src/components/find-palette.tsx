"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { findTargets } from "@/lib/nav";
import { projects } from "@/lib/mock";
import { cn } from "@/lib/utils";

type FindContextValue = { open: () => void };

const FindContext = createContext<FindContextValue>({ open: () => {} });

export function useFind() {
  return useContext(FindContext);
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function FindProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const value = useMemo(() => ({ open }), [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <FindContext.Provider value={value}>
      {children}
      {isOpen ? <Palette onClose={() => setIsOpen(false)} /> : null}
    </FindContext.Provider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const targets = useMemo(() => findTargets(projects), []);
  const q = query.trim().toLowerCase();
  const results = q
    ? targets.filter((t) => t.label.toLowerCase().includes(q))
    : targets;
  const active = Math.min(index, Math.max(results.length - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex(Math.min(active + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active].href);
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center bg-[color-mix(in_oklab,var(--ds-background-200)_80%,transparent)] px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find"
        onKeyDown={onKeyDown}
        className="shadow-modal w-full max-w-[560px] origin-top animate-in rounded-xl bg-popover duration-300 ease-swift fade-in-0 zoom-in-[0.96]"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <MagnifyingGlassIcon className="size-4 shrink-0 text-subtle-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="find-results"
            aria-activedescendant={
              results[active] ? `find-opt-${active}` : undefined
            }
            aria-label="Find pages and projects"
            placeholder="Find pages and projects..."
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
          />
          <kbd className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-subtle-foreground">
            Esc
          </kbd>
        </div>
        <ul
          id="find-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[360px] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-muted-foreground">
              Nothing matches “{query}”.
            </li>
          ) : (
            results.map((t, i) => {
              const header = t.group !== lastGroup;
              lastGroup = t.group;
              return (
                <li key={t.href} role="presentation">
                  {header ? (
                    <p className="px-3 pt-2 pb-1 text-[12px] text-subtle-foreground">
                      {t.group}
                    </p>
                  ) : null}
                  <div
                    id={`find-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => go(t.href)}
                    className={cn(
                      "flex h-9 cursor-pointer items-center rounded-md px-3 font-medium tracking-[-0.02em]",
                      i === active && "bg-[var(--ds-gray-200)]"
                    )}
                  >
                    {t.label}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
