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
import { useAccount } from "@/components/account-context";
import { PixelAvatar } from "@/components/ui/pixel-avatar";
import { cn } from "@/lib/utils";

type OpenOptions = {
  /** Keyboard-initiated: appear with no animation. */
  instant?: boolean;
};

type FindContextValue = { open: (options?: OpenOptions) => void };

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
  const [state, setState] = useState<{ instant: boolean } | null>(null);
  const open = useCallback(
    (options?: OpenOptions) => setState({ instant: options?.instant === true }),
    []
  );
  const value = useMemo(() => ({ open }), [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setState({ instant: true });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <FindContext.Provider value={value}>
      {children}
      {state ? (
        <Palette instant={state.instant} onClose={() => setState(null)} />
      ) : null}
    </FindContext.Provider>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm border px-1.5 font-mono text-caption text-muted-foreground">
      {children}
    </kbd>
  );
}

function Palette({
  instant,
  onClose,
}: {
  instant: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { projects } = useAccount();
  const targets = useMemo(() => findTargets(projects), [projects]);
  const q = query.trim().toLowerCase();
  const results = q
    ? targets.filter((t) => t.label.toLowerCase().includes(q))
    : targets;
  const active = Math.min(index, Math.max(results.length - 1, 0));

  useEffect(() => {
    // Remember the opener before the input takes focus, so closing returns to it.
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  // Keep the highlighted option in view when moving with the arrow keys.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`#find-opt-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The palette is one input; focus stays on it.
      e.preventDefault();
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
      className={cn(
        "fixed inset-0 z-(--z-overlay) flex items-start justify-center bg-[color-mix(in_oklab,var(--ds-background-200)_70%,transparent)] px-4 pt-[8vh] sm:pt-[12vh]",
        !instant && "animate-in duration-150 ease-snappy fade-in-0"
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find"
        onKeyDown={onKeyDown}
        className={cn(
          "shadow-modal w-full max-w-[560px] origin-top rounded-xl bg-popover",
          !instant &&
            "animate-in duration-150 ease-snappy fade-in-0 zoom-in-[0.98]"
        )}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-subtle-foreground"
          />
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
            placeholder="Find pages and projects…"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-subtle-foreground sm:text-[15px]"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul
          ref={listRef}
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
              const Icon = t.icon;
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
                      "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-3 font-medium tracking-[-0.02em] max-sm:h-11",
                      i === active && "bg-[var(--ds-gray-200)]"
                    )}
                  >
                    {Icon ? (
                      <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    ) : t.seed ? (
                      <PixelAvatar seed={t.seed} size={16} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {i === active ? <Kbd>↵</Kbd> : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>
        <div className="hidden h-9 items-center gap-4 border-t px-3 text-caption text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Move
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
