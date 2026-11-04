"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DomainRow = {
  id: string;
  domain: string;
  port: number;
  status: "pending" | "valid" | "invalid";
  nestUsername: string;
  projectName: string | null;
  cname: string | null;
};

type Instructions = { steps: string[]; cname: { name: string; value: string } | null };

const STATUS: Record<DomainRow["status"], { label: string; dot: string }> = {
  valid: { label: "Valid", dot: "bg-ready" },
  pending: { label: "Not checked", dot: "bg-subtle-foreground" },
  invalid: { label: "Needs attention", dot: "bg-[var(--status-error)]" },
};

export function DomainsView({
  initial,
  servers,
  projects,
}: {
  initial: DomainRow[];
  servers: { id: string; nestUsername: string }[];
  projects: { id: string; name: string; port: number; serverId: string }[];
}) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [port, setPort] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [instructions, setInstructions] = useState<{ domain: string; port: number; data: Instructions } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string | null>(null);

  const server = servers[0];

  function pickProject(id: string) {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p) setPort(String(p.port));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setError("Enter a port between 1 and 65535.");
      return;
    }
    setAdding(true);
    try {
      const res = await api<{ instructions: Instructions }>("/api/domains", {
        body: { serverId: server.id, domain, port: n, projectId: projectId || null },
      });
      setInstructions({ domain: domain.trim().toLowerCase(), port: n, data: res.instructions });
      setDomain("");
      setPort("");
      setProjectId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the domain");
    } finally {
      setAdding(false);
    }
  }

  async function check(id: string) {
    setChecking(id);
    try {
      const r = await api<{ status: string; reason: string | null }>(`/api/domains/${id}/verify`, {
        method: "POST",
      });
      setNotes((n) => ({ ...n, [id]: r.reason ?? "" }));
      router.refresh();
    } catch (err) {
      setNotes((n) => ({ ...n, [id]: err instanceof Error ? err.message : "Check failed" }));
    } finally {
      setChecking(null);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/domains/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not remove");
    }
  }

  if (!server) {
    return (
      <p className="rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground">
        Connect a server first, then you can record domains for it.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} aria-label="Add a domain" className="rounded-lg bg-card shadow-border-small">
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_130px]">
          <div>
            <label htmlFor="dom-name" className="mb-1.5 block text-[13px] text-muted-foreground">
              Domain
            </label>
            <Input
              id="dom-name"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="dom-project" className="mb-1.5 block text-[13px] text-muted-foreground">
              Project (optional)
            </label>
            <select
              id="dom-project"
              value={projectId}
              onChange={(e) => pickProject(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dom-port" className="mb-1.5 block text-[13px] text-muted-foreground">
              Target port
            </label>
            <Input
              id="dom-port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
              placeholder="3000"
              className="font-mono"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t bg-background-subtle px-4 py-3">
          <p role="alert" className={cn("text-[13px]", error ? "text-destructive" : "text-muted-foreground")}>
            {error ??
              "Nest maps domains to ports on its own dashboard. Add it here too so Nest Deploy can check DNS."}
          </p>
          <Button type="submit" disabled={adding || !domain.trim()} className="px-3">
            {adding ? "Adding..." : "Add domain"}
          </Button>
        </div>
      </form>

      {instructions ? (
        <section
          aria-labelledby="next-steps"
          className="rounded-lg border border-[var(--ds-blue-700)]/40 bg-[var(--ds-blue-100)] p-4"
        >
          <h2 id="next-steps" className="font-medium tracking-[-0.02em]">
            Next: finish setup for {instructions.domain}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {instructions.data.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {instructions.data.cname ? (
            <div className="mt-3 space-y-2">
              <CopyField label="CNAME name" value={instructions.data.cname.name} />
              <CopyField label="CNAME value" value={instructions.data.cname.value} />
            </div>
          ) : null}
        </section>
      ) : null}

      {initial.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-12 text-center text-muted-foreground">
          No domains recorded yet.
        </p>
      ) : (
        <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
          {initial.map((d) => {
            const s = STATUS[d.status];
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium tracking-[-0.02em]">{d.domain}</p>
                  <p className="text-[13px] text-muted-foreground">
                    Port <span className="font-mono">{d.port}</span>
                    {d.projectName ? <> · {d.projectName}</> : null}
                  </p>
                  {notes[d.id] ? (
                    <p role="status" className="mt-1 text-[13px] text-muted-foreground">
                      {notes[d.id]}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                    <span aria-hidden="true" className={cn("size-2 rounded-full", s.dot)} />
                    {s.label}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checking === d.id}
                    onClick={() => void check(d.id)}
                  >
                    <ArrowsClockwiseIcon />
                    Check
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${d.domain}`}
                    onClick={() => void remove(d.id)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
