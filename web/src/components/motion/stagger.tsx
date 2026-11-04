"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A list whose children rise in one after another the first time it is seen
 * (35ms apart, the first eight; later children arrive with the eighth).
 *
 * After 700ms it sets data-settled, which switches the animation off, so
 * children added later (a filter, a search, a poll) never animate. Nothing
 * here is hidden before it runs: with JavaScript off every child is visible.
 *
 *   <Stagger className="grid gap-4 sm:grid-cols-2">{cards}</Stagger>
 *
 * Use it for the first view of a list, never for logs, menus or search results.
 */
export function Stagger({
  as: Tag = "ul",
  className,
  children,
  ...rest
}: {
  as?: "ul" | "ol" | "div"
  className?: string
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  const [settled, setSettled] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 700)
    return () => clearTimeout(timer)
  }, [])

  return React.createElement(
    Tag,
    {
      ...rest,
      "data-settled": settled ? "" : undefined,
      className: cn("motion-stagger", className),
    },
    children
  )
}
