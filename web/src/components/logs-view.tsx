"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Runtime output of a project's service, read from the container's journal
 * over SSH when you open it or press Refresh.
 */
export function LogsView({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ lines: string[] }>(
        `/api/projects/${projectId}/runtime-logs?lines=300`
      );
      setLines(res.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the logs");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Reading logs is an external side effect, which is what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => void load(), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, load]);

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-6 py-16 text-center text-muted-foreground">
        Logs appear here once you have a project.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = q ? lines.filter((l) => l.toLowerCase().includes(q)) : lines;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="log-project" className="sr-only">
          Project
        </label>
        <select
          id="log-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input
          type="search"
          aria-label="Search logs"
          placeholder="Search logs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-64"
        />
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Refresh every 5s
        </label>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="ml-auto px-3">
          <ArrowsClockwiseIcon className={cn(loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {error}
        </p>
      ) : null}

      <div
        role="log"
        aria-label="Runtime logs"
        tabIndex={0}
        className="max-h-[70vh] min-h-40 overflow-auto rounded-lg bg-card p-4 font-mono text-[13px] leading-5 shadow-border-small"
      >
        {visible.length === 0 ? (
          <p className="py-6 text-center font-sans text-muted-foreground">
            {loading ? "Loading..." : lines.length === 0 ? "No log lines yet." : `No lines match “${query}”.`}
          </p>
        ) : (
          visible.map((l, i) => (
            <p key={i} className="whitespace-pre-wrap break-all">
              {l}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
