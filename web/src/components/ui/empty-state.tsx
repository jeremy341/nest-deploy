import * as React from "react"
import { cn } from "@/lib/utils"
import { NestMark } from "@/components/nest-mark"

/**
 * An empty list, a first-run prompt or a "nothing yet" panel.
 *
 * default: a framed block on a faint fading pixel grid, centred. Use it where
 * the empty state is the whole content of a region.
 * compact: no frame and no grid, left-aligned with the icon beside the title.
 * Use it inside a card body.
 *
 * The title is a <p> unless you pass `as="h2"` (or "h3") so it can join the
 * page's heading outline.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "default",
  as: TitleTag = "p",
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  size?: "default" | "compact"
  as?: "p" | "h2" | "h3"
  className?: string
}) {
  if (size === "compact") {
    return (
      <div data-slot="empty-state" className={cn("py-8", className)}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 text-muted-foreground [&_svg]:size-4"
          >
            {icon ?? <NestMark className="size-4" />}
          </span>
          <TitleTag className="text-body-lg font-semibold">{title}</TitleTag>
        </div>
        {description ? (
          <div className="mt-1 max-w-[46ch] text-muted-foreground">{description}</div>
        ) : null}
        {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    )
  }

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "relative overflow-hidden rounded-lg bg-background px-6 py-14 text-center shadow-border",
        className
      )}
    >
      <div aria-hidden="true" className="grid-patch absolute inset-0" />
      <div className="relative flex flex-col items-center">
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-md bg-background text-muted-foreground shadow-border-small [&_svg]:size-5"
        >
          {icon ?? <NestMark className="size-5 text-foreground" />}
        </span>
        <TitleTag className="mt-4 text-body-lg font-semibold">{title}</TitleTag>
        {description ? (
          <div className="mt-1 max-w-[46ch] text-muted-foreground">{description}</div>
        ) : null}
        {action ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
        ) : null}
      </div>
    </div>
  )
}
