"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwiseIcon, PowerIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Swap } from "@/components/motion/swap";
import { StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

type Tone = "ready" | "building" | "error" | "warning" | "neutral";

const TONE: Record<ServiceState, Tone> = {
  running: "ready",
  starting: "building",
  failed: "error",
  stopped: "neutral",
  not_deployed: "neutral",
  unknown: "neutral",
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
      <dt className="mb-1 text-label text-muted-foreground">{label}</dt>
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
  const [restartMsg, setRestartMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

  /** Throws on failure, so the confirm dialog stays open and shows the message. */
  const restart = useCallback(async () => {
    setRestartMsg(null);
    await api(`/api/projects/${projectId}/restart`, { method: "POST", body: {} });
    setRestartMsg({ ok: true, text: "Restarted." });
    // Give systemd a moment before asking how it came back.
    setTimeout(() => void check(), 2500);
  }, [projectId, check]);

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
    <section
      aria-labelledby="service-heading"
      className="overflow-hidden rounded-lg bg-card shadow-border-small"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="service-heading" className="text-title-3">
          Service
        </h2>
        <div className="flex items-center gap-2">
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={status?.state === "not_deployed"}
              >
                <PowerIcon aria-hidden="true" />
                Restart
              </Button>
            }
            title="Restart the service?"
            description="The app is offline for a few seconds."
            confirmLabel="Restart"
            pendingLabel="Restarting…"
            onConfirm={restart}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={checkNow}
            disabled={loading}
          >
            <ArrowClockwiseIcon aria-hidden="true" className={cn(loading && "animate-spin")} />
            Check now
          </Button>
        </div>
      </div>

      <div
        role="status"
        className={restartMsg ? "border-b px-4 py-2 text-label text-muted-foreground" : "sr-only"}
      >
        {restartMsg ? <Swap value={restartMsg.text}>{restartMsg.text}</Swap> : null}
      </div>

      {status ? (
        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Item label="Status">
            <Swap value={status.state}>
              <StatusIndicator
                tone={TONE[status.state]}
                pending={status.state === "starting"}
                label={LABEL[status.state]}
              />
            </Swap>
          </Item>
          <Item label="Uptime">
            <Swap
              value={status.uptimeSeconds !== null ? formatUptime(status.uptimeSeconds) : "None"}
              className="tabular"
            >
              {status.uptimeSeconds !== null ? formatUptime(status.uptimeSeconds) : "None"}
            </Swap>
          </Item>
          <Item label="Memory">
            <Swap value={status.memoryMb ?? "None"} className="tabular">
              {status.memoryMb !== null ? `${status.memoryMb} MB` : "None"}
            </Swap>
          </Item>
          <Item label="Restarts">
            <Swap value={status.restarts ?? "None"} className="tabular">
              {status.restarts ?? "None"}
            </Swap>
          </Item>
          <Item label="Health check">
            <Swap value={http ? `${http.code}-${http.ms}` : "none"}>
              {http === null || http === undefined ? (
                <span className="font-normal text-muted-foreground">Not checked</span>
              ) : http.code === 0 ? (
                <span className="text-destructive">No answer</span>
              ) : (
                <span className="tabular">
                  HTTP {http.code}
                  {http.ms !== null ? (
                    <span className="font-normal text-muted-foreground"> in {http.ms} ms</span>
                  ) : null}
                </span>
              )}
            </Swap>
          </Item>
        </dl>
      ) : error ? null : (
        <div role="status">
          <span className="sr-only">Checking your container…</span>
          <div aria-hidden="true" className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-5">
            {["Status", "Uptime", "Memory", "Restarts", "Health check"].map((label) => (
              <div key={label}>
                <p className="mb-1 text-label text-muted-foreground">{label}</p>
                <div className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="p-4">
          <Alert tone="error" role="alert">
            {error}.{status ? " The last answer is shown above." : ""}
          </Alert>
        </div>
      ) : null}
    </section>
  );
}
