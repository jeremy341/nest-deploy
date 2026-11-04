"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Marks a value that just changed. Wrap the displayed value and pass the
 * thing that changes as `value`; when it changes, the new content settles in
 * (180ms: fade, 3px rise, 2px blur that bridges old and new).
 *
 *   <Swap value={status}>{status}</Swap>
 *
 * The first render never animates, so a page that loads with data in it is
 * still. Use it for state (a polled value, "Copy" to "Copied"), never for
 * things that arrive on every poll unchanged.
 */
export function Swap({
  value,
  className,
  children,
}: {
  value: React.Key | boolean | null | undefined
  className?: string
  children?: React.ReactNode
}) {
  const [previous, setPrevious] = React.useState(value)
  const [changed, setChanged] = React.useState(false)

  // Adjusting state while rendering: the standard way to react to a prop change.
  if (previous !== value) {
    setPrevious(value)
    setChanged(true)
  }

  return (
    <span
      key={String(value)}
      className={cn("inline-block", changed && "motion-swap", className)}
    >
      {children}
    </span>
  )
}
