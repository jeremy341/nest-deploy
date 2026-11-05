"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A confirmation that makes the person type the name of what they are about
 * to delete. Same behaviour as ConfirmDialog (the action may be async, the
 * dialog stays open and shows the error if it throws, nothing can dismiss it
 * while it runs), plus a text field that has to match `expected` exactly
 * before the confirm button is enabled.
 */
export function TypedConfirmDialog({
  trigger,
  title,
  description,
  expected,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: React.ReactNode;
  /** The exact text that must be typed. */
  expected: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const fieldId = useId();
  const matches = typed === expected;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next && pending) return;
    setOpen(next);
    if (next) {
      setError(null);
      setTyped("");
    }
  }

  async function confirm() {
    if (!matches || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      if (mounted.current) setOpen(false);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent initialFocus={() => document.getElementById(fieldId) ?? true}>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <label htmlFor={fieldId} className="mb-1.5 block text-label text-muted-foreground">
            Type <span className="font-mono text-foreground">{expected}</span> to confirm
          </label>
          <Input
            id={fieldId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={pending}
            className="font-mono"
          />
          {error ? (
            <Alert tone="error" role="alert" className="mt-4">
              {error}
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancel
            </AlertDialogClose>
            <Button
              type="submit"
              variant="destructive-solid"
              loading={pending}
              disabled={!matches}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
