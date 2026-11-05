"use client";

import { useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DialogField = {
  label: string;
  /** Starting text. */
  initial?: string;
  /** Confirm stays disabled until the text equals this exactly. */
  mustMatch?: string;
  /** Select only the part of the name before the last dot. */
  selectStem?: boolean;
  /** Extra guidance under the field. */
  hint?: string;
};

type Props = {
  open: boolean;
  /** Called for Cancel, Escape and (when nothing is running) a finished action. */
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  tone?: "default" | "destructive";
  field?: DialogField;
  /** Where focus goes after the dialog closes (the row that opened it). */
  returnFocus?: () => HTMLElement | null;
  /** Resolve to close the dialog; throw to show the message and stay open. */
  onConfirm: (value: string) => Promise<void> | void;
};

/**
 * A controlled confirmation. ConfirmDialog opens from its own trigger; the
 * file manager opens dialogs from row menus and from the keyboard, so it
 * needs this one. Same behaviour: the action runs inside the dialog, errors
 * show above the buttons, and nothing can dismiss it while the action runs.
 * Content mounts only while open, so every open starts clean.
 */
export function ActionDialog({ open, onClose, returnFocus, ...rest }: Props) {
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  // A destructive dialog without a field starts on Cancel, like ConfirmDialog.
  const startOnCancel = rest.tone === "destructive" && !rest.field;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <AlertDialogContent
        ref={popupRef}
        initialFocus={
          startOnCancel
            ? () => popupRef.current?.querySelector<HTMLElement>("[data-cancel]") ?? true
            : true
        }
        finalFocus={returnFocus ? () => returnFocus() : true}
      >
        <DialogBody {...rest} onClose={onClose} onBusy={setBusy} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DialogBody({
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  field,
  onConfirm,
  onClose,
  onBusy,
}: Omit<Props, "open" | "returnFocus"> & { onBusy: (busy: boolean) => void }) {
  const fieldId = useId();
  const hintId = useId();
  const [value, setValue] = useState(field?.initial ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = field?.mustMatch === undefined || value === field.mustMatch;
  const blank = field !== undefined && field.mustMatch === undefined && value.trim() === "";

  async function submit() {
    if (pending || !matches || blank) return;
    setPending(true);
    onBusy(true);
    setError(null);
    try {
      await onConfirm(value);
      onBusy(false);
      onClose();
    } catch (e) {
      onBusy(false);
      setError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <AlertDialogTitle>{title}</AlertDialogTitle>
      {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
      {field ? (
        <div className="mt-4">
          <label htmlFor={fieldId} className="mb-1.5 block text-label font-medium">
            {field.label}
          </label>
          <Input
            id={fieldId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={pending}
            aria-describedby={field.hint ? hintId : undefined}
            onFocus={(e) => {
              if (!field.selectStem) return;
              const dot = e.target.value.lastIndexOf(".");
              e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
            }}
            className="font-mono text-[13px]"
          />
          {field.hint ? (
            <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
              {field.hint}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <Alert tone="error" role="alert" className="mt-4">
          {error}
        </Alert>
      ) : null}
      <AlertDialogFooter>
        <Button type="button" variant="outline" data-cancel="" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={tone === "destructive" ? "destructive-solid" : "default"}
          loading={pending}
          disabled={!matches || blank}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
