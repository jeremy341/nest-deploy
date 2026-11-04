import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Skeleton primitives. Every route skeleton is built from these only, in the
 * shape of the page it stands in for (same containers, grids, card frames and
 * row heights), so nothing moves more than 4px when data arrives.
 *
 * The shimmer is one band of light shared by every block on the page
 * (.skeleton-sweep uses fixed attachment) and is static under reduced motion.
 */

/** Text-bar widths vary per row from this list. Never random: server and client must agree. */
const SKELETON_WIDTHS = ["w-40", "w-56", "w-32", "w-48", "w-64", "w-36"] as const

/** The width class for row `index`, cycling through SKELETON_WIDTHS. */
function skeletonWidth(index: number): string {
  return SKELETON_WIDTHS[((index % SKELETON_WIDTHS.length) + SKELETON_WIDTHS.length) % SKELETON_WIDTHS.length]
}

/** A shimmering block. Give it a size with className. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("skeleton-sweep rounded-md", className)}
      {...props}
    />
  )
}

type TextSize = "title-1" | "title-2" | "title-3" | "body" | "label" | "caption"

// The row is exactly the role's line-height; the bar inside is 66% of it, so
// skeleton text and real text share the same vertical rhythm.
const TEXT_ROW: Record<TextSize, string> = {
  "title-1": "h-9", // 36px
  "title-2": "h-7", // 28px
  "title-3": "h-5", // 20px
  body: "h-5", // 20px
  label: "h-[18px]",
  caption: "h-4", // 16px
}

/** One or more lines of text, as bars. `width` is a Tailwind width class. */
function SkeletonText({
  size = "body",
  width = "w-32",
  lines = 1,
  className,
}: {
  size?: TextSize
  width?: string
  lines?: number
  className?: string
}) {
  return (
    <div data-slot="skeleton-text" aria-hidden="true" className={className}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cn("flex items-center", TEXT_ROW[size])}>
          <div className={cn("skeleton-sweep h-[66%] max-w-full rounded-sm", width)} />
        </div>
      ))}
    </div>
  )
}

/** A round block (avatars, status dots). `size` is in px. */
function SkeletonCircle({
  size,
  className,
}: {
  size: number
  className?: string
}) {
  return (
    <div
      data-slot="skeleton-circle"
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn("skeleton-sweep shrink-0 rounded-full", className)}
    />
  )
}

/**
 * The real card frame, with an optional header bar and footer bar. The frame
 * itself does not shimmer; only the bars inside it do. Body spacing is up to
 * the caller (children are rendered as they are, usually in p-4).
 */
function SkeletonCard({
  header = false,
  footer = false,
  className,
  children,
}: {
  header?: boolean
  footer?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn("overflow-hidden rounded-lg bg-card shadow-border-small", className)}
    >
      {header ? (
        <div className="border-b px-4 py-3">
          <SkeletonText size="title-3" width="w-32" />
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className="h-[57px] border-t bg-background-subtle px-4 py-3" aria-hidden="true" />
      ) : null}
    </div>
  )
}

/** Mirrors PageHeader exactly: optional 40px block, title, description, action buttons. */
function SkeletonPageHeader({
  description = false,
  actions = 0,
  leading = false,
  className,
}: {
  description?: boolean
  actions?: number
  leading?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="skeleton-page-header"
      aria-hidden="true"
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}
    >
      <div className="flex min-w-0 items-center gap-4">
        {leading ? <Skeleton className="size-10 shrink-0" /> : null}
        <div className="min-w-0">
          <SkeletonText size="title-1" width="w-48" />
          {description ? (
            <SkeletonText size="body" width="w-72" className="mt-1" />
          ) : null}
        </div>
      </div>
      {actions > 0 ? (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 max-sm:h-10" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A list row: min 48px tall, 12px gaps. Use inside a card with hairline-y. */
function SkeletonRow({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="skeleton-row"
      className={cn("flex min-h-12 items-center gap-3 px-4 py-3", className)}
    >
      {children}
    </div>
  )
}

/**
 * The root of every skeleton. Announces the wait once to screen readers and
 * marks the region busy. Labels end with an ellipsis: "Loading deployments…".
 */
function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCircle,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonRow,
  LoadingRegion,
  SKELETON_WIDTHS,
  skeletonWidth,
}
