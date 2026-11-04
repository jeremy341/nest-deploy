"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { cn } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogClose({ ...props }: AlertDialogPrimitive.Close.Props) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
}

/**
 * Portal, backdrop and popup in one. The popup is centred, 440px at most, and
 * enters with a fade and a 0.97 scale (200ms). It leaves with a fade only
 * (120ms). Focus is trapped, Esc closes it and focus returns to the trigger.
 */
function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-backdrop"
        className="fixed inset-0 z-(--z-overlay) min-h-dvh bg-black/30 transition-opacity duration-150 ease-snappy data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute dark:bg-black/60"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-(--z-overlay) w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground shadow-modal outline-none transition-[opacity,scale] duration-200 ease-snappy data-ending-style:opacity-0 data-ending-style:duration-[120ms] data-starting-style:scale-[0.97] data-starting-style:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-body-lg font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("mt-1.5 text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "mt-5 flex justify-end gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full",
        className
      )}
      {...props}
    />
  )
}

/**
 * A confirmation in one element. Replaces window.confirm.
 *
 *   <ConfirmDialog
 *     trigger={<Button variant="outline">Restart</Button>}
 *     title="Restart this service?"
 *     description="The container restarts. Expect a few seconds of downtime."
 *     confirmLabel="Restart"
 *     pendingLabel="Restarting…"
 *     onConfirm={async () => { await post(...) }}
 *   />
 *
 * `onConfirm` may be async. While it runs the confirm button shows the pixel
 * loader and the dialog cannot be dismissed. When it resolves the dialog
 * closes; when it throws the dialog stays open and shows the message above
 * the buttons. A destructive dialog puts initial focus on Cancel.
 */
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  onConfirm,
}: {
  trigger: React.ReactElement
  title: string
  description?: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  tone?: "default" | "destructive"
  onConfirm: () => Promise<void> | void
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function handleOpenChange(next: boolean) {
    // Once the action has started it has to finish before the dialog goes away.
    if (!next && pending) return
    setOpen(next)
    if (next) setError(null)
  }

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      if (mounted.current) setOpen(false)
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.")
      }
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent
        ref={popupRef}
        initialFocus={
          tone === "destructive"
            ? () =>
                popupRef.current?.querySelector<HTMLElement>("[data-cancel]") ??
                true
            : true
        }
      >
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description ? (
          <AlertDialogDescription>{description}</AlertDialogDescription>
        ) : null}
        {error ? (
          <Alert tone="error" role="alert" className="mt-4">
            {error}
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline" data-cancel="" disabled={pending} />}
          >
            Cancel
          </AlertDialogClose>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive-solid" : "default"}
            loading={pending}
            onClick={confirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  ConfirmDialog,
}
