"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Swap } from "@/components/motion/swap";
import { Card } from "@/components/settings-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TOKEN_CANNOT,
  TOKEN_LIMITED,
  TOKEN_PLACEHOLDER,
  curlExample,
  mcpConfigSnippet,
  mcpUrl,
  openApiUrl,
} from "@/lib/developer";

/**
 * A Copy button. The announcement sits in its own live region so it is read
 * once. `onFail` runs when the browser refuses (no clipboard permission), so
 * the caller can select the text for a manual copy.
 */
export function CopyButton({
  text,
  label,
  onFail,
  className,
}: {
  text: string;
  /** Finishes the accessible name: "Copy the curl example". */
  label: string;
  onFail?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
      onFail?.();
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "copied" ? 1600 : 4000);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={label}
        className={className}
      >
        <Swap value={state} className="inline-flex items-center gap-1">
          {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : "Copy"}
        </Swap>
      </Button>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Could not copy. Select the text and copy it by hand." : ""}
      </span>
    </>
  );
}

/** A block of code that scrolls sideways inside itself, with a Copy button. */
export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative min-w-0 rounded-md bg-[var(--code-bg)] shadow-border-base">
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto p-3 pr-24 font-mono text-[12.5px] leading-5 max-sm:pr-3 max-sm:pb-14"
      >
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 max-sm:top-auto max-sm:bottom-2">
        <CopyButton text={code} label={`Copy: ${label}`} />
      </div>
    </div>
  );
}

function Sub({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

const body = "max-w-[62ch] text-muted-foreground";

/** The "Use with AI agents and scripts" section. */
export function DeveloperDocs({ origin }: { origin: string }) {
  return (
    <div id="agents" className="scroll-mt-20">
      <Card
        id="agents-heading"
        title="Use with AI agents and scripts"
        description="Give a script or an AI agent a token and it can work with your projects through the API, without your password."
      >
        <div className="space-y-6">
          <Sub id="agents-can" title="What a token can do">
            <p className={body}>
              Only what you tick when you create it: read and, if you allow it, change your projects, deployments,
              environment variables, domains, alerts and resource use. Secret values are write-only: a token can set an
              environment variable but never read its value back.
            </p>
          </Sub>

          <Sub id="agents-limited" title="What a token can do only under tight limits">
            <ul className="max-w-[62ch] list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {TOKEN_LIMITED.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className={body}>
              These use the same switches as the dashboard. A token never turns a switch on, and it does not sign in
              again: it can use a switch you turned on with a recent Hack Club sign-in until its 7 days end or you turn
              the switch off.
            </p>
          </Sub>

          <Sub id="agents-cannot" title="What a token cannot do">
            <p className={body}>These always need you, signed in to the browser. No token can:</p>
            <ul className="max-w-[62ch] list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {TOKEN_CANNOT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Sub>

          <Sub id="agents-curl" title="Try it with curl">
            <p className={body}>
              Replace <code className="font-mono text-[12.5px] text-foreground">{TOKEN_PLACEHOLDER}</code> with your
              token. Keep real tokens out of code you share.
            </p>
            <CodeBlock code={curlExample(origin)} label="curl example" />
          </Sub>

          <Sub id="agents-openapi" title="OpenAPI description">
            <p className={body}>Load this into a client generator or an API tool.</p>
            <div className="flex items-start gap-2 rounded-md bg-[var(--code-bg)] p-2 pl-3 shadow-border-base">
              <a
                href={openApiUrl(origin)}
                target="_blank"
                rel="noreferrer"
                className={cn("link min-w-0 flex-1 break-all py-1 font-mono text-[12.5px] leading-5")}
              >
                {openApiUrl(origin)}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <CopyButton text={openApiUrl(origin)} label="Copy the OpenAPI URL" />
            </div>
          </Sub>

          <Sub id="agents-mcp" title="Connect an AI agent">
            <p className={body}>
              Clients that speak MCP over HTTP can connect to{" "}
              <code className="font-mono text-[12.5px] break-all text-foreground">{mcpUrl(origin)}</code>. Add this to
              the client&apos;s config and put your token in the Authorization header.
            </p>
            <CodeBlock code={mcpConfigSnippet(origin)} label="MCP client config" />
          </Sub>
        </div>
      </Card>
    </div>
  );
}
