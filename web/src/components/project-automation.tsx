"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { Swap } from "@/components/motion/swap";
import { Card, Label } from "@/components/settings-ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/status";
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

// ------------------------------------------------------------ alerts

type AlertSettings = {
  diskPct: number;
  memoryPct: number;
  cpuPct: number;
  failuresBeforeDown: number;
  slowMs: number | null;
  channels: { down: boolean; recovery: boolean; resource: boolean; deploy: boolean };
  mute: { active: boolean; forever: boolean; until: string | null };
};

type AlertEvent = {
  id: string;
  type: "down" | "disk" | "memory" | "cpu" | "deploy";
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  muted: boolean;
};

const EVENT_LABEL: Record<AlertEvent["type"], string> = {
  down: "Not answering",
  disk: "Disk",
  memory: "Memory",
  cpu: "CPU load",
  deploy: "Deploy result",
};

const CHANNELS = [
  { key: "down", label: "The app stops answering", hint: "After the number of failed checks above." },
  { key: "recovery", label: "The app answers again", hint: "One message when it is back." },
  { key: "resource", label: "Disk, memory or CPU warnings", hint: "One message when a limit is reached and one when it clears." },
  { key: "deploy", label: "Deployment results", hint: "Which deployments follow the Send setting above." },
] as const;

/** A whole number in range, or the message to show. Mirrors the server's check. */
function wholeNumber(raw: string, min: number, max: number, what: string): number | string {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return `${what} must be a whole number from ${min} to ${max}.`;
  const n = Number(text);
  if (n < min || n > max) return `${what} must be from ${min} to ${max}.`;
  return n;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AlertsCard({ project }: { project: ProjectView }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [history, setHistory] = useState<AlertEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState({ disk: "90", memory: "90", cpu: "90", slow: "" });
  const [failures, setFailures] = useState("2");
  const [channels, setChannels] = useState<AlertSettings["channels"]>({
    down: true,
    recovery: true,
    resource: true,
    deploy: true,
  });
  const [errors, setErrors] = useState<Partial<Record<"disk" | "memory" | "cpu" | "slow", string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pause, setPause] = useState<"1h" | "24h" | "until_resumed">("1h");
  const [pausing, setPausing] = useState<"pause" | "resume" | null>(null);

  const apply = useCallback((s: AlertSettings) => {
    setSettings(s);
    setForm({
      disk: String(s.diskPct),
      memory: String(s.memoryPct),
      cpu: String(s.cpuPct),
      slow: s.slowMs === null ? "" : String(s.slowMs),
    });
    setFailures(String(s.failuresBeforeDown));
    setChannels(s.channels);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ settings: AlertSettings; history: AlertEvent[] }>(
      `/api/projects/${project.id}/notify/alerts`
    )
      .then((res) => {
        if (cancelled) return;
        apply(res.settings);
        setHistory(res.history);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load alert settings");
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, attempt, apply]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const disk = wholeNumber(form.disk, 1, 100, "The disk limit");
    const memory = wholeNumber(form.memory, 1, 100, "The memory limit");
    const cpu = wholeNumber(form.cpu, 1, 100, "The CPU limit");
    const slow = form.slow.trim() === "" ? null : wholeNumber(form.slow, 50, 60000, "The response time limit");
    const next: typeof errors = {};
    if (typeof disk === "string") next.disk = disk;
    if (typeof memory === "string") next.memory = memory;
    if (typeof cpu === "string") next.cpu = cpu;
    if (typeof slow === "string") next.slow = slow;
    setErrors(next);
    const firstBad = (["disk", "memory", "cpu", "slow"] as const).find((k) => next[k]);
    if (firstBad) {
      document.getElementById(`alert-${firstBad}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ settings: AlertSettings }>(`/api/projects/${project.id}/notify/alerts`, {
        method: "PUT",
        body: {
          diskPct: disk,
          memoryPct: memory,
          cpuPct: cpu,
          failuresBeforeDown: Number(failures),
          slowMs: slow,
          channels,
        },
      });
      apply(res.settings);
      toast.success("Alert settings saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function changeMute(action: "pause" | "resume") {
    setPausing(action);
    try {
      const res =
        action === "pause"
          ? await api<{ settings: AlertSettings }>(`/api/projects/${project.id}/notify/mute`, {
              method: "POST",
              body: { duration: pause },
            })
          : await api<{ settings: AlertSettings }>(`/api/projects/${project.id}/notify/mute`, {
              method: "DELETE",
            });
      setSettings(res.settings);
      toast.success(action === "pause" ? "Alerts paused" : "Alerts resumed");
    } catch (err) {
      toast.error(
        action === "pause" ? "Could not pause alerts" : "Could not resume alerts",
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setPausing(null);
    }
  }

  const field = (
    id: "disk" | "memory" | "cpu" | "slow",
    label: string,
    hint: string,
    extra?: { placeholder?: string }
  ) => (
    <div>
      <Label htmlFor={`alert-${id}`}>{label}</Label>
      <Input
        id={`alert-${id}`}
        inputMode="numeric"
        autoComplete="off"
        value={form[id]}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })}
        placeholder={extra?.placeholder}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={`alert-${id}-note`}
        className="font-mono"
      />
      <p
        id={`alert-${id}-note`}
        className={cn("mt-1.5 text-label", errors[id] ? "text-destructive" : "text-muted-foreground")}
      >
        {errors[id] ?? hint}
      </p>
    </div>
  );

  return (
    <Card
      id="alerts-heading"
      title="Alerts"
      description="Choose what counts as a problem, which problems reach your webhook, and when to stay quiet. Every alert is kept in the history below, even when it is not sent."
      docsHref="/docs/notifications"
      docsTopic="alerts"
      footer={
        settings ? (
          <>
            <p className="text-label text-muted-foreground">
              Messages go to the webhook in Notifications.
            </p>
            <Button type="submit" form="alerts-form" loading={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        ) : undefined
      }
    >
      {loadError ? (
        <Alert
          tone="error"
          role="alert"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => {
                setLoadError(null);
                setAttempt((n) => n + 1);
              }}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : !settings ? (
        <p role="status" className="text-muted-foreground">
          Loading alert settings…
        </p>
      ) : (
        <div className="space-y-6">
          {settings.mute.active ? (
            <Alert
              tone="warning"
              title="Alerts are paused"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void changeMute("resume")}
                  loading={pausing === "resume"}
                  disabled={pausing !== null}
                >
                  {pausing === "resume" ? "Resuming…" : "Resume alerts"}
                </Button>
              }
            >
              {settings.mute.until
                ? `Nothing is sent until ${when(settings.mute.until)}. Events are still recorded.`
                : "Nothing is sent until you resume. Events are still recorded."}
            </Alert>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48 max-sm:w-full">
                <Label htmlFor="alert-pause">Pause all alerts</Label>
                <NativeSelect
                  id="alert-pause"
                  value={pause}
                  onChange={(e) => setPause(e.target.value as typeof pause)}
                >
                  <option value="1h">For 1 hour</option>
                  <option value="24h">For 24 hours</option>
                  <option value="until_resumed">Until I resume</option>
                </NativeSelect>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void changeMute("pause")}
                loading={pausing === "pause"}
                disabled={pausing !== null}
              >
                {pausing === "pause" ? "Pausing…" : "Pause"}
              </Button>
            </div>
          )}

          <form id="alerts-form" onSubmit={save} noValidate className="space-y-6">
            <fieldset className="min-w-0">
              <legend className="mb-3 font-medium">When to warn</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {field("disk", "Disk full (%)", "Default 90.")}
                {field("memory", "Memory used (%)", "Default 90.")}
                {field("cpu", "CPU load per core (%)", "Default 90.")}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="alert-failures">Failed checks before down</Label>
                  <NativeSelect
                    id="alert-failures"
                    value={failures}
                    onChange={(e) => setFailures(e.target.value)}
                    aria-describedby="alert-failures-note"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                  <p id="alert-failures-note" className="mt-1.5 text-label text-muted-foreground">
                    Checks run every few minutes. Default 2.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  {field(
                    "slow",
                    "Slow response limit (ms)",
                    "Leave empty for no limit. A slower answer counts as a failed check.",
                    { placeholder: "Off" }
                  )}
                </div>
              </div>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="mb-1 font-medium">Send to the webhook</legend>
              <ul className="hairline-y mt-2 overflow-hidden rounded-md shadow-border-base">
                {CHANNELS.map((c) => (
                  <li key={c.key}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={channels[c.key]}
                        onChange={(e) => setChannels({ ...channels, [c.key]: e.target.checked })}
                      />
                      <span className="min-w-0">
                        <span className="block">{c.label}</span>
                        <span className="block text-label text-muted-foreground">{c.hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            {saveError ? (
              <Alert tone="error" role="alert">
                {saveError}
              </Alert>
            ) : null}
          </form>

          <section aria-labelledby="alert-history-heading">
            <h3 id="alert-history-heading" className="font-medium">
              History
            </h3>
            <p className="mt-0.5 text-label text-muted-foreground">Kept for 90 days.</p>
            {history.length === 0 ? (
              <p className="mt-3 text-muted-foreground">Nothing has fired yet.</p>
            ) : (
              <ul className="hairline-y mt-3 overflow-hidden rounded-md shadow-border-base">
                {history.map((ev) => (
                  <li key={ev.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-medium">{EVENT_LABEL[ev.type]}</span>
                      <span className="flex items-center gap-2 text-label text-muted-foreground">
                        {ev.muted ? <Badge variant="outline">Not sent, paused</Badge> : null}
                        {ev.type === "deploy" ? null : ev.resolvedAt ? (
                          <Badge variant="secondary">Resolved</Badge>
                        ) : (
                          <Badge variant="destructive">Still happening</Badge>
                        )}
                        <time dateTime={ev.firedAt} title={when(ev.firedAt)}>
                          {timeAgo(ev.firedAt)}
                        </time>
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{ev.message}</p>
                    {ev.resolvedAt ? (
                      <p className="mt-0.5 text-label text-muted-foreground">
                        Cleared <time dateTime={ev.resolvedAt}>{when(ev.resolvedAt)}</time>.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}
