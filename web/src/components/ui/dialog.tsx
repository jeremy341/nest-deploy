"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "@/lib/utils"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * A dialog for a longer task than an alert: a header, a body that scrolls on
 * small screens and whatever footer the caller puts inside. `md` is 440px wide
 * and `lg` is 640px. It enters with a fade and a 0.97 scale and leaves with a
 * fade. Focus is trapped, and Esc closes it unless the caller stops it in
 * `onOpenChange`.
 */
function DialogContent({
  className,
  size = "md",
  children,
  ...props
}: DialogPrimitive.Popup.Props & { size?: "md" | "lg" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-(--z-overlay) min-h-dvh bg-black/30 transition-opacity duration-150 ease-snappy data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute dark:bg-black/60"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-(--z-overlay) flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-modal outline-none transition-[opacity,scale] duration-200 ease-snappy data-ending-style:opacity-0 data-ending-style:duration-[120ms] data-starting-style:scale-[0.97] data-starting-style:opacity-0",
          size === "lg" ? "max-w-[640px]" : "max-w-[440px]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-body-lg font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
}
