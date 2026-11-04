"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades a block up as it scrolls into view. Content is visible by default
 * (server render, no JavaScript, reduced motion); only blocks that start
 * below the fold are hidden, just before first paint, and revealed once.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds to wait after entering view, for staggering siblings. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.dataset.hidden = "true";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        window.setTimeout(() => {
          el.dataset.hidden = "false";
        }, delay);
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={cn(
        "ease-out-strong transition-[opacity,transform] duration-700 data-[hidden=true]:translate-y-4 data-[hidden=true]:opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
