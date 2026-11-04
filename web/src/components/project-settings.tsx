"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectView } from "@/server/queries";

type EnvVar = { id: string; key: string; target: "all" | "production" | "preview" };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Card({
  id,
  title,
  description,
  children,
  footer,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg bg-card shadow-border-small">
      <div className="p-5">
        <h2 id={id} className="text-xl font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
      {footer ? (
        <div className="flex items-center justify-between gap-3 rounded-b-lg border-t bg-background-subtle px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] text-muted-foreground">
      {children}
    </label>
  );
}

export function ProjectSettings({
  project,
  env: initialEnv,
}: {
  project: ProjectView;
  env: EnvVar[];
}) {
  const router = useRouter();

  // ---- build and run settings
  const [form, setForm] = useState({
    port: String(project.port),
    startCommand: project.startCommand ?? "",
    productionBranch: project.branch,
    healthPath: project.healthPath,
    autoDeploy: project.autoDeploy,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: {
          port: Number(form.port),
          startCommand: form.startCommand.trim() || null,
          productionBranch: form.productionBranch.trim(),
          healthPath: form.healthPath.trim() || "/",
          autoDeploy: form.autoDeploy,
        },
      });
      setSaveMsg({ ok: true, text: "Saved. Changes apply to the next deployment." });
      router.refresh();
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  // ---- environment variables
  const [env, setEnv] = useState(initialEnv);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<EnvVar["target"]>("all");
  const [envError, setEnvError] = useState<string | null>(null);

  async function addEnv(e: React.FormEvent) {
    e.preventDefault();
    setEnvError(null);
    try {
      const res = await api<{ env: EnvVar[] }>(`/api/projects/${project.id}/env`, {
        method: "POST",
        body: { key, value, target },
      });
      setEnv(res.env);
      setKey("");
      setValue("");
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function removeEnv(id: string) {
    try {
      await api(`/api/projects/${project.id}/env/${id}`, { method: "DELETE" });
      setEnv((list) => list.filter((v) => v.id !== id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete");
    }
  }

  // ---- danger zone
  const [confirm, setConfirm] = useState("");
  const [removeRemote, setRemoteRemoval] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function destroy() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/projects/${project.id}${removeRemote ? "?remote=1" : ""}`, {
        method: "DELETE",
      });
      router.push("/projects");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6">
      <Card
        id="run-heading"
        title="Build and Run"
        description="How this project starts on your Nest container."
        footer={
          <>
            <p
              role="status"
              className={saveMsg?.ok === false ? "text-[13px] text-destructive" : "text-[13px] text-muted-foreground"}
            >
              {saveMsg?.text ?? "Changes apply to the next deployment."}
            </p>
            <Button type="submit" form="run-form" disabled={saving} className="px-3">
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <form id="run-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ps-branch">Production branch</Label>
            <Input
              id="ps-branch"
              value={form.productionBranch}
              onChange={(e) => setForm({ ...form, productionBranch: e.target.value })}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="ps-port">Port</Label>
            <Input
              id="ps-port"
              inputMode="numeric"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ps-start">Start command</Label>
            <Input
              id="ps-start"
              value={form.startCommand}
              placeholder={project.runtime === "node" ? "npm start" : "python3 app.py"}
              onChange={(e) => setForm({ ...form, startCommand: e.target.value })}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="ps-health">Health check path</Label>
            <Input
              id="ps-health"
              value={form.healthPath}
              onChange={(e) => setForm({ ...form, healthPath: e.target.value })}
              className="font-mono"
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={form.autoDeploy}
              onChange={(e) => setForm({ ...form, autoDeploy: e.target.checked })}
              className="size-4"
            />
            Deploy automatically on push
          </label>
        </form>
      </Card>

      <Card
        id="env-heading"
        title="Environment Variables"
        description="Stored encrypted. They are written to your server when you deploy, and values are never shown again."
      >
        <form onSubmit={addEnv} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_130px_auto] sm:items-end">
          <div>
            <Label htmlFor="env-key">Name</Label>
            <Input
              id="env-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="API_KEY"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="env-value">Value</Label>
            <Input
              id="env-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="env-target">Applies to</Label>
            <select
              id="env-target"
              className={selectClass}
              value={target}
              onChange={(e) => setTarget(e.target.value as EnvVar["target"])}
            >
              <option value="all">All</option>
              <option value="production">Production</option>
              <option value="preview">Preview</option>
            </select>
          </div>
          <Button type="submit" disabled={!key.trim()} className="px-3">
            Save
          </Button>
        </form>
        {envError ? (
          <p role="alert" className="mt-2 text-[13px] text-destructive">
            {envError}
          </p>
        ) : null}

        {env.length > 0 ? (
          <ul className="hairline-y mt-4 overflow-hidden rounded-md shadow-border-base">
            {env.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate font-mono text-[13px]">{v.key}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  <span className="text-[13px] capitalize">{v.target}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${v.key}`}
                    onClick={() => void removeEnv(v.id)}
                  >
                    <TrashIcon />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-muted-foreground">No variables yet.</p>
        )}
      </Card>

      <Card
        id="danger-heading"
        title="Delete Project"
        description="Removes the project from Nest Deploy. Optionally stops it and deletes its releases on your server first."
      >
        <label className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={removeRemote}
            onChange={(e) => setRemoteRemoval(e.target.checked)}
            className="size-4"
          />
          Also stop the service and delete releases on {project.nestUsername}.hackclub.app
        </label>
        <Label htmlFor="del-confirm">
          Type <span className="font-mono text-foreground">{project.slug}</span> to confirm
        </Label>
        <div className="flex gap-2">
          <Input
            id="del-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="font-mono"
          />
          <Button
            variant="destructive"
            disabled={confirm !== project.slug || deleting}
            onClick={() => void destroy()}
            className="shrink-0 px-3"
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
        {deleteError ? (
          <p role="alert" className="mt-2 text-[13px] text-destructive">
            {deleteError}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
