import * as React from "react"
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"
import { fieldClass } from "@/components/ui/input"

/**
 * The classes of the native <select> itself: the Input field look plus no
 * browser arrow and room for ours. Explicit colours so Windows dark mode does
 * not draw a light popup.
 */
const nativeSelectClass = cn(
  fieldClass,
  "appearance-none bg-background pr-8 text-foreground dark:bg-background"
)

/**
 * A native <select> in the product's field style, with a caret. `className`
 * goes on the wrapper (set widths there); `selectClassName` goes on the select.
 */
function NativeSelect({
  className,
  selectClassName,
  children,
  ...props
}: React.ComponentProps<"select"> & { selectClassName?: string }) {
  return (
    <div
      data-slot="native-select-wrapper"
      className={cn("relative w-full", className)}
    >
      <select
        data-slot="native-select"
        className={cn(nativeSelectClass, selectClassName)}
        {...props}
      >
        {children}
      </select>
      <CaretDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect, nativeSelectClass }
