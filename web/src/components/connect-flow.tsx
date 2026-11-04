"use client";

import { useState } from "react";
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Placeholder only. The real flow generates a dedicated ed25519 key per user.
const SAMPLE_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAISAMPLEKEYFORDESIGNPREVIEWONLY nest-deploy";

type Status = "idle" | "testing" | "connected" | "failed";

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-[12px] font-medium tabular"
    >
      {n}
    </span>
  );
}

export function ConnectFlow() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function test() {
    if (!username.trim()) {
      setError("Enter your Nest username first.");
      return;
    }
    setError(null);
    setStatus("testing");
    // Simulated for the design preview. The real check runs an SSH login.
    setTimeout(() => {
      setStatus(username.trim().toLowerCase() === "denied" ? "failed" : "connected");
    }, 1200);
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="text-[28px] leading-9 font-semibold">Connect a Nest server</h1>
      <p className="mt-1 text-muted-foreground">
        Add a key in the Nest dashboard so Nest Deploy can log in to your container.
      </p>

      <ol className="mt-8 space-y-8">
        <li className="flex gap-4">
          <StepNumber n={1} />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-medium">Enter your Nest username</h2>
            <label htmlFor="nest-username" className="block text-[13px] text-muted-foreground">
              The name you log in with, as in <code className="font-mono">ssh username@hackclub.app</code>.
            </label>
            <Input
              id="nest-username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null);
                if (status !== "idle") setStatus("idle");
              }}
              placeholder="username"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "username-error" : undefined}
              className="max-w-xs font-mono"
            />
            {error ? (
              <p id="username-error" className="text-[13px] text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </li>

        <li className="flex gap-4">
          <StepNumber n={2} />
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="font-medium">Add this key in the Nest dashboard</h2>
            <p className="text-[13px] text-muted-foreground">
              Paste it into the SSH Keys page and choose Add SSH Key.
            </p>
            <CopyField value={SAMPLE_PUBLIC_KEY} label="Public key" />
            <a
              href="https://dashboard.hackclub.app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Open Nest dashboard
              <ArrowUpRightIcon />
            </a>

            <div className="flex gap-3 rounded-md border bg-muted/40 p-3 text-[13px]">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>
                This key gives Nest Deploy root access to your container, because
                Nest logs SSH sessions in as root. Remove the key from the Nest
                dashboard at any time to revoke access.
              </p>
            </div>
          </div>
        </li>

        <li className="flex gap-4">
          <StepNumber n={3} />
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="font-medium">Test the connection</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={test} disabled={status === "testing"}>
                {status === "testing" ? (
                  <CircleNotchIcon className="animate-spin" />
                ) : null}
                {status === "testing" ? "Connecting" : "Test connection"}
              </Button>
              <p
                role="status"
                aria-live="polite"
                className={cn(
                  "flex items-center gap-2 text-[13px]",
                  status === "connected" && "text-success",
                  status === "failed" && "text-destructive"
                )}
              >
                {status === "connected" ? (
                  <>
                    <CheckCircleIcon className="size-4" weight="fill" />
                    Connected to {username.trim()}.hackclub.app
                  </>
                ) : null}
                {status === "failed" ? (
                  <>
                    <XCircleIcon className="size-4" weight="fill" />
                    Permission denied (publickey). Check that the key is added in the Nest dashboard.
                  </>
                ) : null}
              </p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Design preview: the connection test is simulated.
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
