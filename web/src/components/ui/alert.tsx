import * as React from "react"
import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr"
import { cn } from "@/lib/utils"

export type AlertTone = "note" | "info" | "success" | "warning" | "error"

// Classes are written out in full so Tailwind can see them. Text inside a tone
// is always --foreground; only the icon carries the tone colour.
const TONES: Record<
  AlertTone,
  { frame: string; icon: string; Icon: React.ElementType }
> = {
  note: {
    frame:
      "bg-[var(--tone-note-bg)] shadow-[0_0_0_1px_var(--tone-note-ring)]",
    icon: "text-[var(--tone-note-icon)]",
    Icon: InfoIcon,
  },
  info: {
    frame:
      "bg-[var(--tone-info-bg)] shadow-[0_0_0_1px_var(--tone-info-ring)]",
    icon: "text-[var(--tone-info-icon)]",
    Icon: InfoIcon,
  },
  success: {
    frame:
      "bg-[var(--tone-success-bg)] shadow-[0_0_0_1px_var(--tone-success-ring)]",
    icon: "text-[var(--tone-success-icon)]",
    Icon: CheckCircleIcon,
  },
  warning: {
    frame:
      "bg-[var(--tone-warning-bg)] shadow-[0_0_0_1px_var(--tone-warning-ring)]",
    icon: "text-[var(--tone-warning-icon)]",
    Icon: WarningIcon,
  },
  error: {
    frame:
      "bg-[var(--tone-error-bg)] shadow-[0_0_0_1px_var(--tone-error-ring)]",
    icon: "text-[var(--tone-error-icon)]",
    Icon: WarningCircleIcon,
  },
}

/**
 * An inline message inside a page or a card. Use role="alert" when it appears
 * after an action (a failed save), role="status" for a result the user asked
 * for, and no role for a message that was there from the start.
 */
export function Alert({
  tone,
  title,
  children,
  action,
  role,
  className,
}: {
  tone: AlertTone
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  role?: "alert" | "status"
  className?: string
}) {
  const { frame, icon, Icon } = TONES[tone]
  return (
    <div
      data-slot="alert"
      data-tone={tone}
      role={role}
      className={cn("flex gap-3 rounded-lg p-4 text-foreground", frame, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-medium">{title}</div> : null}
        {children ? <div className={cn(title ? "mt-0.5" : undefined)}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
