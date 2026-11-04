import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

/**
 * Shared field styling, also used by NativeSelect. The focus ring is replaced
 * by a border colour plus a soft glow (outline-none is justified by that).
 */
const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base transition-[border-color,box-shadow] duration-(--dur-fast) ease-snappy outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-[var(--ds-gray-alpha-600)] focus-visible:border-[var(--ds-focus-color)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ds-focus-color)_25%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_25%,transparent)] aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_25%,transparent)] max-sm:h-10 md:text-sm dark:bg-input/30"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(fieldClass, className)}
      {...props}
    />
  )
}

export { Input, fieldClass }
