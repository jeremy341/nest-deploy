"use client"

import * as React from "react"

type RevealTag = "div" | "section" | "article" | "ul" | "ol" | "li" | "p" | "span" | "figure"

/**
 * Scroll reveal for the marketing page, below the hero only.
 *
 * Content is visible by default (server render, no JavaScript, reduced
 * motion). After hydration, a block that starts below the fold, further than
 * 100px under the bottom edge of the viewport, is hidden and then revealed
 * once, when it crosses that line. A block already in view never hides.
 *
 * variant "rise" (default): fades in and rises 16px over 600ms.
 * variant "light": only dims to 15% and switches on in 120ms, for small marks
 * such as the lit squares of the step track. Use `delay` (ms) to sequence them.
 *
 * Wrap the content block of a section in one Reveal, not each paragraph.
 */
export function Reveal({
  as = "div",
  className,
  delay,
  variant = "rise",
  style,
  children,
}: {
  as?: RevealTag
  className?: string
  delay?: number
  variant?: "rise" | "light"
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const ref = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (typeof IntersectionObserver === "undefined") return
    if (el.getBoundingClientRect().top <= window.innerHeight - 100) return

    el.dataset.reveal = "hidden"
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.reveal = "shown"
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -100px 0px" }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      // If the block unmounts or re-runs mid-way, never leave it hidden.
      if (el.dataset.reveal === "hidden") delete el.dataset.reveal
    }
  }, [])

  return React.createElement(
    as,
    {
      ref,
      className,
      "data-reveal-variant": variant,
      style:
        delay !== undefined
          ? ({ ...style, "--reveal-delay": `${delay}ms` } as React.CSSProperties)
          : style,
    },
    children
  )
}
