"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ServerView } from "@/server/queries";
import { cn } from "@/lib/utils";

type TestResponse = {
  result:
    | { ok: true; issues: { level: "error" | "warning"; message: string }[] }
    | { ok: false; error: string; kind: string };
  server: ServerView;
};

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-medium tracking-[-0.02em]">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function ServerCard({ initial }: { initial: ServerView }) {
  const router = useRouter();
  const [server, setServer] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [outcome, setOutcome] = useState<TestResponse["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function test() {
    setTesting(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await api<TestResponse>(`/api/servers/${server.id}/test`, { method: "POST" });
      setServer(res.server);
      setOutcome(res.result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run the test");
    } finally {
      setTesting(false);
    }
  }

  async function rotate() {
    if (!window.confirm("Generate a new key? The old key stops working once you remove it in the Nest dashboard, and you must add the new one.")) return;
    try {
      const res = await api<{ server: ServerView }>(`/api/servers/${server.id}/rotate-key`, { method: "POST" });
      setServer(res.server);
      setOutcome(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rotate the key");
    }
  }

  async function remove() {
    if (!window.confirm(`Disconnect ${server.nestUsername}? Your running apps are not touched. Remove the key from the Nest dashboard to end our access.`)) return;
    try {
      await api(`/api/servers/${server.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    }
  }

  const connected = server.status === "connected";
  const issues = server.issues;

  return (
    <section aria-label={`Server ${server.nestUsername}`} className="rounded-lg bg-card shadow-border-small">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
            {server.nestUsername}.hackclub.app
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-ready" : server.status === "error" ? "bg-[var(--status-error)]" : "bg-subtle-foreground"
              )}
            />
            {connected ? "Connected" : server.status === "error" ? "Could not connect" : "Waiting for the key"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void test()} disabled={testing} className="px-3">
            {testing ? <CircleNotchIcon className="animate-spin" /> : null}
            {testing ? "Connecting..." : "Test connection"}
          </Button>
          <Button variant="outline" onClick={() => void rotate()} className="px-3">
            New key
          </Button>
          <Button variant="ghost" onClick={() => void remove()} className="px-3">
            Disconnect
          </Button>
        </div>
      </div>

      {server.status !== "connected" ? (
        <div className="space-y-3 border-t px-5 py-4">
          <p className="text-muted-foreground">
            Paste this public key into the SSH Keys page of the Nest dashboard, then press Test connection.
          </p>
          <CopyField label="Public key" value={server.publicKey} />
          <a
            href="https://dashboard.hackclub.app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            Open the Nest dashboard
            <ArrowUpRightIcon className="size-4" />
          </a>
        </div>
      ) : null}

      {error || (outcome && !outcome.ok) || server.lastError ? (
        <div role="alert" className="flex gap-3 border-t px-5 py-4 text-destructive">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{error ?? (outcome && !outcome.ok ? outcome.error : server.lastError)}</p>
        </div>
      ) : null}

      {connected && server.probe ? (
        <div className="border-t px-5 py-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircleIcon weight="fill" className="size-5 text-ready" />
            Reached your container
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">System</dt><dd className="truncate">{server.probe.os}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Logged in as</dt><dd className="font-mono text-[13px]">{server.probe.uid === 0 ? "root" : `uid ${server.probe.uid}`}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Node.js</dt><dd className="font-mono text-[13px]">{server.probe.nodeVersion ?? "not installed"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Python</dt><dd className="font-mono text-[13px]">{server.probe.pythonVersion ?? "not installed"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">systemd</dt><dd>{server.probe.systemdState}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Key fingerprint</dt><dd className="truncate font-mono text-[12px]">{server.keyFingerprint}</dd></div>
          </dl>
          {issues.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {issues.map((i) => (
                <li
                  key={i.message}
                  className={cn(
                    "flex gap-3 rounded-md p-3",
                    i.level === "error" ? "bg-destructive/5 text-destructive" : "bg-[var(--ds-amber-100)]"
                  )}
                >
                  <WarningIcon className="mt-0.5 size-4 shrink-0" />
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ConnectFlow({ servers }: { servers: ServerView[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api("/api/servers", { body: { nestUsername: username.trim() } });
      setUsername("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6">
      <div>
        <h1 className="text-[28px] leading-9 font-semibold">Connect a Nest server</h1>
        <p className="mt-1 text-muted-foreground">
          Nest Deploy signs in to your container with a key made just for it. You stay in control:
          removing the key in the Nest dashboard ends our access.
        </p>
      </div>

      {servers.map((s) => (
        <ServerCard key={s.id} initial={s} />
      ))}

      <section aria-labelledby="add-heading" className="rounded-lg bg-card p-5 shadow-border-small">
        <h2 id="add-heading" className="mb-4 text-xl font-semibold tracking-[-0.02em]">
          {servers.length === 0 ? "Add your server" : "Add another server"}
        </h2>
        <ol className="space-y-5">
          <Step n={1} title="Enter your Nest username">
            <form onSubmit={create} className="flex flex-wrap items-start gap-2">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="nest-user" className="sr-only">
                  Nest username
                </label>
                <Input
                  id="nest-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-nest-username"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby="nest-user-help"
                  className="font-mono"
                />
                <p id="nest-user-help" className={cn("mt-1.5 text-[13px]", error ? "text-destructive" : "text-muted-foreground")}>
                  {error ?? (
                    <>
                      The name you log in with, as in <code className="font-mono">ssh username@hackclub.app</code>.
                    </>
                  )}
                </p>
              </div>
              <Button type="submit" disabled={creating || !username.trim()} className="h-9 px-3">
                {creating ? "Creating..." : "Create key"}
              </Button>
            </form>
          </Step>
          <Step n={2} title="Add the key in the Nest dashboard">
            <p className="text-muted-foreground">
              We show the public key here after step 1. Paste it on the SSH Keys page of the Nest dashboard.
            </p>
          </Step>
          <Step n={3} title="Test the connection">
            <p className="text-muted-foreground">
              We connect once, remember the server&apos;s identity, and check what your container can run.
            </p>
          </Step>
        </ol>
        <div className="mt-5 flex gap-3 rounded-md bg-[var(--ds-amber-100)] p-3">
          <WarningIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            This key gives Nest Deploy the same access as your own login, because SSH into Nest lands in a
            root shell inside your container. Only connect a container you are happy to deploy to.
          </p>
        </div>
      </section>
    </div>
  );
}
