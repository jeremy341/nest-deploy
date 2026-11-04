"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckIcon, CopySimpleIcon } from "@phosphor-icons/react";
import { Swap } from "@/components/motion/swap";
import { toast } from "@/components/ui/toast";

type Label = "Terminal" | "HTML";

/** Soft edge shadows on whichever side still has code to scroll to. */
const SCROLL_SHADOW: CSSProperties = {
  background: [
    "linear-gradient(to right, var(--code-bg) 30%, transparent) 0 0 / 32px 100% no-repeat local",
    "linear-gradient(to left, var(--code-bg) 30%, transparent) 100% 0 / 32px 100% no-repeat local",
    "linear-gradient(to right, color-mix(in oklab, var(--foreground) 14%, transparent), transparent) 0 0 / 14px 100% no-repeat scroll",
    "linear-gradient(to left, color-mix(in oklab, var(--foreground) 14%, transparent), transparent) 100% 0 / 14px 100% no-repeat scroll",
  ].join(", "),
};

/** Splits a shell line into code and a trailing `# comment` (a `#` that starts a word, outside quotes). */
function splitComment(line: string): [string, string] {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return [line.slice(0, i), line.slice(i)];
    }
  }
  return [line, ""];
}

function renderShell(code: string): ReactNode[] {
  return code.split("\n").flatMap((line, i, all) => {
    const [text, comment] = splitComment(line);
    const nodes: ReactNode[] = [text];
    if (comment) {
      nodes.push(
        <span key={`c${i}`} className="text-subtle-foreground">
          {comment}
        </span>
      );
    }
    if (i < all.length - 1) nodes.push("\n");
    return nodes;
  });
}

export function CodeBlock({ label, code }: { label: Label; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      toast.error("Could not copy", "Select the text and copy it by hand.");
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mt-6 border bg-[var(--code-bg)]">
      <div className="flex h-10 items-center justify-between border-b px-3">
        <span className="font-mono text-[12px] text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="pressable inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground max-sm:h-10"
        >
          <Swap value={copied ? "copied" : "copy"} className="inline-flex items-center gap-1.5">
            {copied ? (
              <CheckIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <CopySimpleIcon aria-hidden="true" className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Swap>
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </div>
      <pre
        style={SCROLL_SHADOW}
        tabIndex={0}
        role="region"
        aria-label={`${label} code`}
        className="overflow-x-auto p-4 font-mono text-code text-foreground"
      >
        <code>{label === "Terminal" ? renderShell(code) : code}</code>
      </pre>
    </div>
  );
}
