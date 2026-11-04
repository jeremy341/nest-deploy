"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { PageHeader } from "@/components/page-header";
import { StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
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
        className="shadow-border-base tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--ds-gray-100)] text-caption"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium tracking-[-0.02em]">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function Probe({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
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

  /** Throws on failure, so the confirm dialog stays open and shows the message. */
  async function rotate() {
    const res = await api<{ server: ServerView }>(`/api/servers/${server.id}/rotate-key`, {
      method: "POST",
    });
    setServer(res.server);
    setOutcome(null);
    setError(null);
    router.refresh();
  }

  async function remove() {
    await api(`/api/servers/${server.id}`, { method: "DELETE" });
    router.refresh();
  }

  const connected = server.status === "connected";
  const issues = server.issues;
  const failure = error ?? (outcome && !outcome.ok ? outcome.error : server.lastError);
  const headingId = `server-${server.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg bg-card shadow-border-small"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-5">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-title-2">
            {server.nestUsername}.hackclub.app
          </h2>
          <div className="mt-0.5 text-muted-foreground">
            <StatusIndicator
              className="font-normal tracking-normal"
              tone={connected ? "ready" : server.status === "error" ? "error" : "neutral"}
              label={
                connected
                  ? "Connected"
                  : server.status === "error"
                    ? "Could not connect"
                    : "Waiting for the key"
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void test()} loading={testing} className="px-3">
            {testing ? "Connecting…" : "Test connection"}
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="px-3">
                New key
              </Button>
            }
            title="Generate a new key?"
            description="The old key stops working once you remove it in the Nest dashboard, and you must add the new one."
            confirmLabel="Generate key"
            pendingLabel="Generating…"
            onConfirm={rotate}
          />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" className="px-3">
                Disconnect
              </Button>
            }
            tone="destructive"
            title={`Disconnect ${server.nestUsername}?`}
            description="Your running apps are not touched. Remove the key from the Nest dashboard to end our access."
            confirmLabel="Disconnect"
            pendingLabel="Disconnecting…"
            onConfirm={remove}
          />
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
            className="link inline-flex items-center gap-1 font-medium max-sm:min-h-10"
          >
            Open the Nest dashboard
            <ArrowUpRightIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      ) : null}

      {failure ? (
        <div className="border-t p-5">
          <Alert tone="error" role="alert">
            {failure}
          </Alert>
        </div>
      ) : null}

      {connected && server.probe ? (
        <div className="motion-fade border-t px-5 py-4">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircleIcon
              aria-hidden="true"
              weight="fill"
              className="size-5 text-[var(--tone-success-icon)]"
            />
            Reached your container
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Probe label="System">{server.probe.os}</Probe>
            <Probe label="Logged in as">
              <span className="font-mono text-[13px]">
                {server.probe.uid === 0 ? "root" : `uid ${server.probe.uid}`}
              </span>
            </Probe>
            <Probe label="Node.js">
              <span className="font-mono text-[13px]">
                {server.probe.nodeVersion ?? "not installed"}
              </span>
            </Probe>
            <Probe label="Python">
              <span className="font-mono text-[13px]">
                {server.probe.pythonVersion ?? "not installed"}
              </span>
            </Probe>
            <Probe label="systemd">{server.probe.systemdState}</Probe>
            <Probe label="Key fingerprint">
              <span className="font-mono text-[12px]">{server.keyFingerprint}</span>
            </Probe>
          </dl>
          {issues.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {issues.map((i) => (
                <li key={i.message}>
                  <Alert tone={i.level === "error" ? "error" : "warning"}>{i.message}</Alert>
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
    <div className="motion-enter mx-auto w-full max-w-[720px] space-y-6">
      <PageHeader
        title="Connect a Nest server"
        description="Nest Deploy signs in to your container with a key made just for it. You stay in control: removing the key in the Nest dashboard ends our access."
        actions={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Read the docs about connecting a server"
            render={<Link href="/docs/servers#servers-connection" />}
          >
            Docs
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </Button>
        }
      />

      {servers.map((s) => (
        <ServerCard key={s.id} initial={s} />
      ))}

      <section aria-labelledby="add-heading" className="rounded-lg bg-card p-5 shadow-border-small">
        <h2 id="add-heading" className="mb-4 text-title-2">
          {servers.length === 0 ? "Add your server" : "Add another server"}
        </h2>
        <ol className="space-y-5">
          <Step n={1} title="Enter your Nest username">
            <form onSubmit={create} className="flex flex-wrap items-start gap-2">
              <div className="min-w-[220px] flex-1 max-sm:basis-full">
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
                <p
                  id="nest-user-help"
                  role={error ? "alert" : undefined}
                  className={cn(
                    "mt-1.5 text-label",
                    error ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {error ?? (
                    <>
                      The name you log in with, as in <code className="font-mono">ssh username@hackclub.app</code>.
                    </>
                  )}
                </p>
              </div>
              <Button
                type="submit"
                loading={creating}
                disabled={!username.trim()}
                className="px-3"
              >
                {creating ? "Creating…" : "Create key"}
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
        <Alert tone="warning" className="mt-5">
          This key gives Nest Deploy the same access as your own login, because SSH into Nest lands in a
          root shell inside your container. Only connect a container you are happy to deploy to.
        </Alert>
      </section>
    </div>
  );
}
