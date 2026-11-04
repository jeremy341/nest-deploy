"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { Swap } from "@/components/motion/swap";
import { Card, Label } from "@/components/settings-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ProjectView } from "@/server/queries";

export function DeployHookCard({ project }: { project: ProjectView }) {
  const router = useRouter();
  const [active, setActive] = useState(project.hookActive);
  /** Only set right after creating: the URL cannot be shown again. */
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const res = await api<{ url: string }>(`/api/projects/${project.id}/hook`, { method: "POST" });
      setUrl(res.url);
      setActive(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the hook");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    setError(null);
    try {
      await api(`/api/projects/${project.id}/hook`, { method: "DELETE" });
      setActive(false);
      setUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the hook");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      id="hook-heading"
      title="Deploy Hook"
      description="A private URL that starts a deployment when something sends it a POST. Use it from CI, a cron job or a script."
      docsHref="/docs/hooks"
      docsTopic="deploy hooks"
    >
      {url ? (
        <div className="motion-enter space-y-3">
          <CopyField value={url} label="Deploy hook URL" />
          <p className="text-label text-muted-foreground">
            Copy it now. For safety it is not shown again. Anyone with this URL can deploy this
            project, so treat it like a password.
          </p>
          <pre
            tabIndex={0}
            aria-label="Terminal code"
            className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-[12.5px] leading-5 shadow-border-base"
          >
            {`curl -X POST ${url}`}
          </pre>
        </div>
      ) : active ? (
        <p className="text-muted-foreground">
          A hook is active and its URL is hidden. Make a new one to see a URL again; the old one
          stops working at once.
        </p>
      ) : (
        <p className="text-muted-foreground">No hook yet.</p>
      )}
      <p className="mt-3 text-label text-muted-foreground">
        An optional body of <code className="font-mono">{`{ "branch": "my-branch" }`}</code> builds
        that branch as a preview. One deployment runs at a time: a second call while one is running
        gets a 409.
      </p>
      {error ? (
        <Alert tone="error" role="alert" className="mt-3">
          {error}
        </Alert>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void create()}
          loading={busy === "create"}
          disabled={busy !== null}
        >
          {busy === "create" ? (active ? "Making…" : "Creating…") : active ? "Make a new URL" : "Create hook"}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void revoke()}
            loading={busy === "revoke"}
            disabled={busy !== null}
          >
            {busy === "revoke" ? "Revoking…" : "Revoke"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function NotificationsCard({ project }: { project: ProjectView }) {
  const router = useRouter();
  const [saved, setSaved] = useState(project.notify);
  const [url, setUrl] = useState("");
  const [on, setOn] = useState<"all" | "failures">(project.notify?.on ?? "all");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMsg(null);
    try {
      const res = await api<{ notify: NonNullable<ProjectView["notify"]> }>(
        `/api/projects/${project.id}/notify`,
        { method: "PUT", body: { url, on } }
      );
      setSaved(res.notify);
      setUrl("");
      setMsg({ ok: true, text: "Saved. Send a test message to check it." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      await api(`/api/projects/${project.id}/notify/test`, { method: "POST" });
      setMsg({ ok: true, text: "Sent. Check the channel." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send" });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setMsg(null);
    try {
      await api(`/api/projects/${project.id}/notify`, { method: "DELETE" });
      setSaved(null);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not remove" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      id="notify-heading"
      title="Notifications"
      description="Get a message in Discord or Slack when a deployment finishes. Paste an incoming webhook URL."
      docsHref="/docs/notifications"
      docsTopic="notifications"
    >
      {saved ? (
        <p className="mb-4 text-muted-foreground">
          Sending to {saved.kind === "discord" ? "Discord" : "Slack"} for{" "}
          {saved.on === "all" ? "every finished deployment" : "failed deployments only"}. The URL is
          hidden. Paste a new one to replace it.
        </p>
      ) : null}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_190px_auto] sm:items-end">
        <div>
          <Label htmlFor="notify-url">Webhook URL</Label>
          <Input
            id="notify-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="notify-on">Send</Label>
          <NativeSelect
            id="notify-on"
            value={on}
            onChange={(e) => setOn(e.target.value as "all" | "failures")}
          >
            <option value="all">Every deployment</option>
            <option value="failures">Failures only</option>
          </NativeSelect>
        </div>
        <Button
          type="submit"
          disabled={!url.trim() || busy !== null}
          loading={busy === "save"}
        >
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </form>
      {msg ? (
        msg.ok ? (
          <p role="status" className="mt-2 text-label text-muted-foreground">
            <Swap value={msg.text}>{msg.text}</Swap>
          </p>
        ) : (
          <Alert tone="error" role="alert" className="mt-3">
            {msg.text}
          </Alert>
        )
      ) : null}
      {saved ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void test()}
            loading={busy === "test"}
            disabled={busy !== null}
          >
            {busy === "test" ? "Sending…" : "Send test message"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void remove()}
            loading={busy === "remove"}
            disabled={busy !== null}
          >
            {busy === "remove" ? "Removing…" : "Remove"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Publish or unpublish the project's public status page. */
export function StatusPageCard({ project }: { project: ProjectView }) {
  const router = useRouter();
  const [url, setUrl] = useState(project.statusUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (url) {
        await api(`/api/projects/${project.id}/status-page`, { method: "DELETE" });
        setUrl(null);
      } else {
        const res = await api<{ url: string }>(`/api/projects/${project.id}/status-page`, {
          method: "POST",
          body: {},
        });
        setUrl(res.url);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status page");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="status-page-heading"
      title="Public Status Page"
      description="A page anyone with the link can open to see whether this app is answering. It shows the name, the current state and recent outages, and nothing else."
      docsHref="/docs/status-page"
      docsTopic="the public status page"
    >
      {url ? (
        <CopyField value={url} label="Status page URL" />
      ) : (
        <p className="text-muted-foreground">Not published.</p>
      )}
      <p className="mt-3 text-label text-muted-foreground">
        It reflects the worker&apos;s checks, which run every few minutes. Unpublishing makes the old link stop working.
      </p>
      {error ? (
        <Alert tone="error" role="alert" className="mt-3">
          {error}
        </Alert>
      ) : null}
      <div className="mt-4">
        <Button
          type="button"
          variant={url ? "outline" : "default"}
          onClick={() => void toggle()}
          loading={busy}
        >
          {busy ? (url ? "Unpublishing…" : "Publishing…") : url ? "Unpublish" : "Publish status page"}
        </Button>
      </div>
    </Card>
  );
}
