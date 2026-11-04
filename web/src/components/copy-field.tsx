"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-input bg-muted/40 p-2 pl-3">
      <code
        aria-label={label}
        className="min-w-0 flex-1 break-all py-1 font-mono text-[12.5px] leading-5"
      >
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-live="polite"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
