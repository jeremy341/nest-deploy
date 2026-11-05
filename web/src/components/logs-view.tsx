"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowsClockwiseIcon, DownloadSimpleIcon, ListDashesIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Segmented } from "@/components/segmented";
import { StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_LOG_RANGE,
  LOG_RANGES,
  logFileName,
  logFileText,
  type LogLevel,
  type LogRange,
} from "@/lib/log-filter";
import { cn } from "@/lib/utils";

const SKELETON_LINE_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-1/2", "w-3/4", "w-5/6"];

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
  // False until the first read for this project has finished. Only that first
  // read shows skeleton lines; later reads (search, auto refresh) keep the old
  // lines on screen until the new ones arrive.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The search box updates at once; the server is asked once typing pauses.
  const [term, setTerm] = useState("");
  const [range, setRange] = useState<LogRange>(DEFAULT_LOG_RANGE);
  const [level, setLevel] = useState<LogLevel>("all");
  const [auto, setAuto] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Only the newest request may write its result, so a slow answer for the
  // project you just left cannot land under the one you are looking at.
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // `quiet` is the automatic refresh: it does not touch the Refresh button, so
  // nothing on screen flickers every five seconds.
  const load = useCallback(
    async (quiet = false) => {
      if (!projectId) return;
      const mine = ++latest.current;
      if (!quiet) setLoading(true);
      try {
        const res = await api<{ lines: string[] }>(
          `/api/projects/${projectId}/runtime-logs?lines=300&range=${range}&level=${level}${term ? `&q=${encodeURIComponent(term)}` : ""}`
        );
        if (mine !== latest.current) return;
        setLines(res.lines);
        setError(null);
      } catch (e) {
        if (mine !== latest.current) return;
        setError(e instanceof Error ? e.message : "Could not read the logs");
      } finally {
        if (mine === latest.current) {
          setLoading(false);
          setReady(true);
        }
      }
    },
    [projectId, term, range, level]
  );

  useEffect(() => {
    // Reading logs is an external side effect, which is what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => void load(true), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, load]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<ListDashesIcon />}
        title="No logs yet"
        description="Logs appear here once you have a project."
        action={
          <Link href="/new" className={cn(buttonVariants())}>
            New project
          </Link>
        }
      />
    );
  }

  function pickProject(id: string) {
    // Another project's lines must not sit under this one's name while it loads.
    setProjectId(id);
    setLines([]);
    setReady(false);
  }

  const showSkeleton = !ready && lines.length === 0;

  // Saves exactly the lines on screen, as plain text.
  function download() {
    const name = projects.find((p) => p.id === projectId)?.name ?? "project";
    const url = URL.createObjectURL(
      new Blob([logFileText(lines)], { type: "text/plain;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = logFileName(name, range);
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="log-project" className="sr-only">
          Project
        </label>
        <NativeSelect
          id="log-project"
          value={projectId}
          onChange={(e) => pickProject(e.target.value)}
          className="w-48 max-sm:w-full"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="search"
          aria-label="Search logs"
          placeholder="Search the last 1000 lines…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-80 flex-1 max-sm:max-w-none max-sm:basis-full"
        />
        <Segmented<LogRange>
          label="Time range"
          value={range}
          onChange={setRange}
          options={LOG_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <Segmented<LogLevel>
          label="Level"
          value={level}
          onChange={setLevel}
          options={[
            { value: "all", label: "All lines" },
            { value: "problems", label: "Warnings and errors" },
          ]}
        />
        <label className="inline-flex min-h-10 items-center gap-2 text-label text-muted-foreground sm:min-h-8">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Refresh every 5s
        </label>
        {auto ? (
          <StatusIndicator tone="ready" label="Live" className="motion-fade text-label" />
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={download}
            disabled={lines.length === 0}
            aria-label={`Download ${lines.length} visible ${lines.length === 1 ? "line" : "lines"} as a text file`}
          >
            <DownloadSimpleIcon aria-hidden="true" />
            Download
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <ArrowsClockwiseIcon aria-hidden="true" className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="error" role="alert">
          {error}
        </Alert>
      ) : null}

      <div
        role="log"
        aria-label="Runtime logs"
        aria-busy={showSkeleton || undefined}
        tabIndex={0}
        className="log-surface max-h-[70vh] min-h-[320px] overflow-auto rounded-lg py-3 shadow-border-small"
      >
        {showSkeleton ? (
          Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="flex h-5 items-center px-4">
              <Skeleton
                className={cn(
                  "h-3 max-w-full rounded-sm",
                  SKELETON_LINE_WIDTHS[(i * 3) % SKELETON_LINE_WIDTHS.length]
                )}
              />
            </div>
          ))
        ) : lines.length === 0 ? (
          <p className="px-4 py-12 text-center font-sans text-muted-foreground">
            {error
              ? "Logs could not be read."
              : term
                ? `No lines match “${term}”.`
                : level === "problems"
                  ? "No warnings or errors in this time range."
                  : "No log lines in this time range."}
          </p>
        ) : (
          lines.map((l, i) => (
            <p key={i} className="log-line whitespace-pre-wrap break-all">
              {l}
            </p>
          ))
        )}
      </div>
      {level === "problems" ? (
        <p className="text-label text-muted-foreground">
          Warnings and errors are found by words such as warn, error, failed and fatal in each line.
        </p>
      ) : null}
    </div>
  );
}
