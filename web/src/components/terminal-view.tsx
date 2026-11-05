"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowClockwiseIcon, TerminalWindowIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PixelLoader } from "@/components/ui/pixel-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { IdleSkeleton } from "@/components/terminal-skeleton";
import type { ScreenEnd } from "@/components/terminal-screen";

/** xterm touches `window`, so it is only ever loaded in the browser, and only once a terminal is opened. */
const TerminalScreen = dynamic(() => import("@/components/terminal-screen"), {
  ssr: false,
  loading: () => <Skeleton className="h-[clamp(280px,62dvh,720px)] w-full rounded-lg" />,
});

/** What the server returns when a session opens (see terminal.ts SessionInfo). */
type Session = {
  sessionId: string;
  banner: string;
  identity: string | null;
  host: string;
  openedAt: number;
  expiresAt: number;
  idleMs: number;
  maxAgeMs: number;
  serverNow: number;
};

type Phase =
  | { kind: "checking" }
  | { kind: "idle"; resume: Session | null }
  | { kind: "connecting" }
  | { kind: "live"; session: Session }
  | { kind: "ended"; reason: ScreenEnd }
  | { kind: "error"; message: string };

const END_TEXT: Record<ScreenEnd, { title: string; body: string }> = {
  idle: {
    title: "Terminal closed after a pause",
    body: "It closes after 10 minutes without typing. Anything running in it was stopped.",
  },
  limit: {
    title: "Terminal reached its time limit",
    body: "A terminal closes after 60 minutes, whatever you are doing. Anything running in it was stopped.",
  },
  closed: { title: "Terminal closed", body: "You closed this terminal." },
  "shell-exit": { title: "The shell ended", body: "The shell on your container exited, for example after typing exit." },
  "connection-lost": {
    title: "The connection dropped",
    body: "The connection to your container was lost, so the shell is gone.",
  },
  error: { title: "The terminal stopped", body: "The shell stopped unexpectedly." },
  gone: { title: "This terminal is no longer open", body: "It was closed or timed out while you were away." },
};

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function TerminalView({
  projectId,
  projectName,
  host,
}: {
  projectId: string;
  projectName: string;
  host: string;
}) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/terminal`;
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [live, setLive] = useState(true);
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  // When the session ends if nothing more happens, on this device's clock.
  const [deadline, setDeadline] = useState(0);
  const [hardEnd, setHardEnd] = useState(0);
  const [now, setNow] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Is a terminal already open from an earlier visit or a reload?
  useEffect(() => {
    let cancelled = false;
    api<{ session: Session | null }>(base)
      .then((r) => {
        if (!cancelled) setPhase({ kind: "idle", resume: r.session });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "idle", resume: null });
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const startSession = useCallback((session: Session) => {
    const skew = Date.now() - session.serverNow;
    setDeadline(session.expiresAt + skew);
    setHardEnd(session.openedAt + session.maxAgeMs + skew);
    setNow(Date.now());
    setLive(true);
    setInputProblem(null);
    setCloseError(null);
    setPhase({ kind: "live", session });
  }, []);

  const open = useCallback(async () => {
    setPhase({ kind: "connecting" });
    try {
      startSession(await api<Session>(base, { method: "POST", body: {} }));
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not open a terminal.",
      });
    }
  }, [base, startSession]);

  const closeSession = useCallback(
    async (sessionId: string) => {
      setBusy(true);
      setCloseError(null);
      try {
        await api(`${base}/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        setPhase({ kind: "ended", reason: "closed" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not close the terminal.";
        if (/not found/i.test(message)) setPhase({ kind: "ended", reason: "gone" });
        else setCloseError(message);
      } finally {
        setBusy(false);
      }
    },
    [base]
  );

  // The countdown only runs while a terminal is open.
  const isLive = phase.kind === "live";
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // After the terminal goes away, put keyboard focus on what replaced it.
  const settled = phase.kind === "ended" || phase.kind === "error";
  useEffect(() => {
    if (settled) headingRef.current?.focus();
  }, [settled]);

  const onEnd = useCallback((reason: ScreenEnd) => setPhase({ kind: "ended", reason }), []);
  const onFail = useCallback((message: string) => setPhase({ kind: "error", message }), []);
  const onLeave = useCallback(() => closeRef.current?.focus(), []);

  // ---------------------------------------------------------------- idle

  if (phase.kind === "checking") {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Checking for an open terminal…</span>
        <IdleSkeleton />
      </div>
    );
  }

  if (phase.kind === "idle" || phase.kind === "connecting") {
    const resume = phase.kind === "idle" ? phase.resume : null;
    return (
      <OpenCard
        host={host}
        projectName={projectName}
        resume={resume}
        connecting={phase.kind === "connecting"}
        busy={busy}
        onOpen={open}
        onResume={() => resume && startSession(resume)}
        onCloseOld={async () => {
          if (!resume) return;
          await closeSession(resume.sessionId);
          setPhase({ kind: "idle", resume: null });
        }}
        error={closeError}
      />
    );
  }

  if (phase.kind === "error" || phase.kind === "ended") {
    const isError = phase.kind === "error";
    const text = isError ? null : END_TEXT[phase.reason];
    const timeout = !isError && (phase.reason === "idle" || phase.reason === "limit");
    return (
      <section
        aria-labelledby="terminal-end"
        className="rounded-lg bg-card p-5 shadow-border-small"
      >
        <h2
          id="terminal-end"
          ref={headingRef}
          tabIndex={-1}
          className="text-title-2 outline-none"
        >
          {isError ? "The terminal could not be opened" : text?.title}
        </h2>
        <p className="mt-1 max-w-[60ch] text-muted-foreground">
          {isError ? phase.message : text?.body}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="lg" onClick={open}>
            <ArrowClockwiseIcon aria-hidden="true" data-icon="inline-start" />
            {isError ? "Try again" : timeout ? "Reopen terminal" : "Open a new terminal"}
          </Button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------- live

  const { session } = phase;
  const remaining = Math.max(0, deadline - now);
  const atHardLimit = Math.abs(deadline - hardEnd) < 1000;
  const closingSoon = remaining > 0 && remaining < 60_000;

  return (
    <div className="space-y-3">
      <p className="sr-only" role="status" aria-live="polite">
        {live ? "Terminal connected." : "Reconnecting to the terminal."}
      </p>

      <Alert tone="warning">
        <strong className="font-medium">This is a shell on your Nest container.</strong> Commands run for
        real.
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 font-medium">
            {live ? (
              <>
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ready" />
                {session.identity ? `Connected as ${session.identity}` : "Connected"}
              </>
            ) : (
              <>
                <PixelLoader size="sm" />
                Reconnecting…
              </>
            )}
            <span className="font-normal text-muted-foreground">on {session.host}</span>
          </p>
          <p className="text-sm text-muted-foreground">{session.banner}</p>
        </div>
        <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Time left <span className="font-mono text-foreground tabular-nums">{formatLeft(remaining)}</span>
          </p>
          <Button
            ref={closeRef}
            type="button"
            size="lg"
            variant="outline"
            loading={busy}
            onClick={() => void closeSession(session.sessionId)}
          >
            <XIcon aria-hidden="true" data-icon="inline-start" />
            Close terminal
          </Button>
        </div>
      </div>

      {closingSoon ? (
        <Alert tone="info" role="status">
          This terminal closes in under a minute.{" "}
          {atHardLimit ? "It is reaching the 60 minute limit." : "Type something to keep it open."}
        </Alert>
      ) : null}
      {closeError ? <Alert tone="error" role="alert">{closeError}</Alert> : null}
      {inputProblem ? <Alert tone="error" role="alert">{inputProblem}</Alert> : null}

      <TerminalScreen
        projectId={projectId}
        sessionId={session.sessionId}
        label={`Terminal on ${session.host}`}
        onEnd={onEnd}
        onFail={onFail}
        onDeadline={setDeadline}
        onLive={setLive}
        onInputProblem={setInputProblem}
        onLeave={onLeave}
      />

      <p className="max-w-[80ch] text-sm text-muted-foreground">
        The terminal takes every key while it has focus, including Tab. To leave it from the keyboard,
        press Escape, then Tab: focus moves to Close terminal. Copy with Ctrl+Shift+C, paste with Ctrl+V.
        Leaving this page keeps the terminal open until it times out, and you can resume it here.
      </p>
    </div>
  );
}

function OpenCard({
  host,
  projectName,
  resume,
  connecting,
  busy,
  onOpen,
  onResume,
  onCloseOld,
  error,
}: {
  host: string;
  projectName: string;
  resume: Session | null;
  connecting: boolean;
  busy: boolean;
  onOpen: () => void;
  onResume: () => void;
  onCloseOld: () => void;
  error: string | null;
}) {
  return (
    <section aria-labelledby="terminal-open" className="rounded-lg bg-card shadow-border-small">
      <div className="p-5">
        <h2 id="terminal-open" className="text-title-2">
          {resume ? "A terminal is already open" : `Open a terminal on ${host}`}
        </h2>
        <p className="mt-1 max-w-[62ch] text-muted-foreground">
          {resume
            ? `You left a terminal open for ${projectName}. Pick it up where you left off, or close it.`
            : `A live shell on your Nest container, starting in the folder for ${projectName}. Commands run for real, as root or whichever user Nest gives this container. The terminal tells you which once it connects.`}
        </p>
        <ul className="mt-4 max-w-[62ch] list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>It closes after 10 minutes without typing, or after 60 minutes in total.</li>
          <li>Only one terminal per project can be open at a time.</li>
          <li>Nest Deploy records when a terminal opens and closes. It never records what you type or see.</li>
        </ul>
        {error ? (
          <Alert tone="error" role="alert" className="mt-4">
            {error}
          </Alert>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-background-subtle px-5 py-3">
        {resume ? (
          <>
            <Button size="lg" onClick={onResume}>
              <TerminalWindowIcon aria-hidden="true" data-icon="inline-start" />
              Resume terminal
            </Button>
            <Button size="lg" variant="outline" loading={busy} onClick={onCloseOld}>
              Close it
            </Button>
          </>
        ) : (
          <Button size="lg" loading={connecting} onClick={onOpen}>
            <TerminalWindowIcon aria-hidden="true" data-icon="inline-start" />
            {connecting ? "Connecting…" : "Open terminal"}
          </Button>
        )}
      </div>
    </section>
  );
}
