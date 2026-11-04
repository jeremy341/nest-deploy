"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ServiceState, ServiceStatus } from "@/server/service-status";

const REFRESH_MS = 30_000;

const LABEL: Record<ServiceState, string> = {
  running: "Running",
  starting: "Starting",
  failed: "Crashed",
  stopped: "Stopped",
  not_deployed: "Not deployed",
  unknown: "Unknown",
};

const DOT: Record<ServiceState, string> = {
  running: "bg-[var(--ds-green-700,#12a594)]",
  starting: "bg-[var(--ds-amber-700,#f5a623)]",
  failed: "bg-destructive",
  stopped: "bg-[var(--ds-gray-600)]",
  not_deployed: "bg-[var(--ds-gray-600)]",
  unknown: "bg-[var(--ds-gray-600)]",
};

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tracking-[-0.02em]">{children}</dd>
    </div>
  );
}

/**
 * How the production service is doing right now, read from the container.
 * It checks when the page opens and again every 30 seconds while the tab is
 * visible, and has a button for checking on demand.
 */
export function ServiceCard({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  /** Ask the container. State changes only happen after the answer arrives. */
  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await api<{ status: ServiceStatus }>(`/api/projects/${projectId}/status`);
      setStatus(res.status);
      setError(null);
    } catch (err) {
      setError((err instanceof Error ? err.message : "Could not check the service").replace(/\.$/, ""));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [projectId]);

  const checkNow = useCallback(() => {
    setLoading(true);
    void check();
  }, [check]);

  useEffect(() => {
    // Reading the container is an external side effect, which is what effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const timer = setInterval(() => {
      if (!document.hidden) void check();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [check]);

  const http = status?.http;

  return (
    <section aria-labelledby="service-heading" className="rounded-lg bg-card shadow-border-small">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="service-heading" className="font-medium tracking-[-0.02em]">
          Service
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={checkNow}
          disabled={loading}
          aria-label="Check the service now"
        >
          <ArrowClockwiseIcon className={cn(loading && "animate-spin")} />
          Check now
        </Button>
      </div>

      {status ? (
        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Item label="Status">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[status.state])} />
              {LABEL[status.state]}
            </span>
          </Item>
          <Item label="Uptime">
            <span className="tabular">
              {status.uptimeSeconds !== null ? formatUptime(status.uptimeSeconds) : "None"}
            </span>
          </Item>
          <Item label="Memory">
            <span className="tabular">{status.memoryMb !== null ? `${status.memoryMb} MB` : "None"}</span>
          </Item>
          <Item label="Restarts">
            <span className="tabular">{status.restarts ?? "None"}</span>
          </Item>
          <Item label="Health check">
            {http === null || http === undefined ? (
              <span className="font-normal text-muted-foreground">Not checked</span>
            ) : http.code === 0 ? (
              <span className="text-destructive">No answer</span>
            ) : (
              <span className="tabular">
                HTTP {http.code}
                {http.ms !== null ? <span className="font-normal text-muted-foreground"> in {http.ms} ms</span> : null}
              </span>
            )}
          </Item>
        </dl>
      ) : error ? null : (
        <p aria-live="polite" className="px-4 py-6 text-muted-foreground">
          Checking your container...
        </p>
      )}

      {error ? (
        <p role="alert" className="px-4 py-4 text-[13px] text-destructive">
          {error}.{status ? " The last answer is shown above." : ""}
        </p>
      ) : null}
    </section>
  );
}
