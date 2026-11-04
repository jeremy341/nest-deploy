import { cn } from "@/lib/utils"

const SIZES = {
  // sm matches the 8px status dot, md sits in buttons, lg is for empty waits.
  sm: "[--px:3px] [--px-gap:2px]",
  md: "[--px:4px] [--px-gap:2px]",
  lg: "[--px:6px] [--px-gap:3px]",
} as const

/**
 * Work in progress, in the product's own shape: a 2x2 grid of squares in
 * currentColor that light one after another, clockwise, in hard steps.
 *
 * Always aria-hidden. The caller provides the text ("Building", "Saving…").
 * Under prefers-reduced-motion it stops on a fixed pattern (top-left and
 * bottom-right lit, the other two dim).
 */
export function PixelLoader({
  size = "sm",
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="pixel-loader"
      className={cn("pixel-loader", SIZES[size], className)}
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}
