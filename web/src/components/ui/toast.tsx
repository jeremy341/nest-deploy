"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"

type ToastType = "success" | "error" | "info"

const manager = ToastPrimitive.createToastManager()

function add(type: ToastType, title: string, description?: string) {
  return manager.add({
    title,
    description,
    type,
    // Errors stay longer and are announced assertively. Hover or focus pauses the timer.
    timeout: type === "error" ? 6000 : 4000,
    priority: type === "error" ? "high" : "low",
  })
}

/**
 * Transient feedback for an action that has no inline place to report.
 * Replaces window.alert. Call it from event handlers and effects in client
 * components; <Toaster /> must be mounted once (it is, in the root layout).
 *
 *   toast.success("Link copied")
 *   toast.error("Could not restart", "The server did not answer.")
 */
const toast = {
  success: (title: string, description?: string) => add("success", title, description),
  error: (title: string, description?: string) => add("error", title, description),
  info: (title: string, description?: string) => add("info", title, description),
  /** Dismiss one toast by the id the call returned, or all of them. */
  dismiss: (id?: string) => manager.close(id),
}

const ICONS: Record<ToastType, { Icon: React.ElementType; className: string }> = {
  success: { Icon: CheckCircleIcon, className: "text-[var(--tone-success-icon)]" },
  error: { Icon: WarningCircleIcon, className: "text-[var(--tone-error-icon)]" },
  info: { Icon: InfoIcon, className: "text-[var(--tone-info-icon)]" },
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((t) => {
    const tone = ICONS[(t.type as ToastType) ?? "info"] ?? ICONS.info
    return (
      <ToastPrimitive.Root
        key={t.id}
        toast={t}
        className="toast-root rounded-lg bg-popover text-popover-foreground shadow-menu"
      >
        <ToastPrimitive.Content className="toast-content flex items-start gap-3 overflow-hidden p-3 pr-10 max-sm:pr-12">
          <tone.Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone.className}`} />
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="font-medium" />
            <ToastPrimitive.Description className="text-label text-muted-foreground" />
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground max-sm:top-1 max-sm:right-1 max-sm:size-10"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Content>
      </ToastPrimitive.Root>
    )
  })
}

/**
 * Mount once, inside the app's providers. Up to three toasts are visible, the
 * older ones stacked behind the newest; the stack opens on hover or focus.
 * Swipe down or right to dismiss. F6 moves keyboard focus into the stack.
 */
function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={manager} limit={3}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-(--z-toast) w-[356px] max-sm:inset-x-4 max-sm:w-auto max-sm:bottom-[calc(76px+env(safe-area-inset-bottom))]">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

export { Toaster, toast }
