"use client";

import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import type { ITheme, Terminal } from "@xterm/xterm";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClipboardTextIcon,
  CopyIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * The xterm.js screen for one terminal session. Loaded on the client only
 * (terminal-view.tsx imports it with ssr: false); it owns the xterm instance,
 * the output stream (Server-Sent Events, see the stream route), the input
 * queue and the window size. It does not decide when a session starts or
 * ends: it reports what happens through callbacks.
 */

export type ScreenEnd =
  | "closed"
  | "idle"
  | "limit"
  | "shell-exit"
  | "connection-lost"
  | "error"
  | "gone";

export type TerminalScreenProps = {
  projectId: string;
  sessionId: string;
  label: string;
  /** The session is over (the server said so, or it no longer exists). */
  onEnd: (reason: ScreenEnd) => void;
  /** The stream could not be kept up. The session may still be alive on the server. */
  onFail: (message: string) => void;
  /** Client-clock time (ms) the session ends if nothing more happens. */
  onDeadline: (at: number) => void;
  /** The output stream is open (true) or being re-established (false). */
  onLive: (live: boolean) => void;
  /** Input could not be delivered (message) or went through again (null). */
  onInputProblem: (message: string | null) => void;
  /** Keyboard escape hatch: Escape then Tab. */
  onLeave: () => void;
};

const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;
/** Characters per input request; 2000 UTF-16 units are at most 6 KB, under the 8 KB server cap. */
const INPUT_CHUNK = 2000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];
const ESCAPE_TAB_WINDOW_MS = 800;

const FONT_FAMILY =
  'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

// ANSI colours chosen for contrast on the page background in each theme.
const ANSI_LIGHT = {
  black: "#24292f",
  red: "#cf222e",
  green: "#116329",
  yellow: "#7d4e00",
  blue: "#0550ae",
  magenta: "#8250df",
  cyan: "#1b7c83",
  white: "#6e7781",
  brightBlack: "#57606a",
  brightRed: "#a40e26",
  brightGreen: "#1a7f37",
  brightYellow: "#9a6700",
  brightBlue: "#0969da",
  brightMagenta: "#6639ba",
  brightCyan: "#3192aa",
  brightWhite: "#424a53",
};
const ANSI_DARK = {
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Resolve a CSS variable to a computed colour string the terminal can parse. */
function resolveColor(host: HTMLElement, variable: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value && value !== "" ? value : fallback;
}

function readTheme(host: HTMLElement): ITheme {
  const dark = document.documentElement.classList.contains("dark");
  const background = resolveColor(host, "--background", dark ? "#0a0a0a" : "#ffffff");
  const foreground = resolveColor(host, "--foreground", dark ? "#ededed" : "#171717");
  const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(foreground);
  const selectionBackground = rgb
    ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.25)`
    : dark
      ? "rgba(237, 237, 237, 0.25)"
      : "rgba(23, 23, 23, 0.25)";
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground,
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type Controls = {
  send: (data: string) => void;
  copy: () => void;
  paste: () => void;
  focus: () => void;
};

export default function TerminalScreen(props: TerminalScreenProps) {
  const { projectId, sessionId } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);

  // Latest callbacks, read from inside long-lived listeners.
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const base = `/api/projects/${encodeURIComponent(projectId)}/terminal/${encodeURIComponent(sessionId)}`;
    const abort = new AbortController();
    let disposed = false;
    let term: Terminal | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let themeObserver: MutationObserver | undefined;
    let sizeObserver: ResizeObserver | undefined;
    let ended = false;

    // ----- input: ordered, one request at a time -----
    let pending = "";
    let sending = false;
    let inputBroken = false;

    const reportExpiry = (data: { expiresAt?: number; serverNow?: number }) => {
      if (typeof data.expiresAt === "number" && typeof data.serverNow === "number") {
        cb.current.onDeadline(Date.now() + (data.expiresAt - data.serverNow));
      }
    };

    const flush = async () => {
      if (sending || ended || disposed) return;
      sending = true;
      try {
        while (pending.length > 0 && !ended && !disposed) {
          let n = Math.min(INPUT_CHUNK, pending.length);
          // Never cut a surrogate pair in half.
          const last = pending.charCodeAt(n - 1);
          if (n < pending.length && last >= 0xd800 && last <= 0xdbff) n -= 1;
          const data = pending.slice(0, n);
          pending = pending.slice(n);
          const res = await fetch(`${base}/input`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data }),
            signal: abort.signal,
          });
          if (res.status === 404) {
            // The session is gone; the stream will say why.
            pending = "";
            break;
          }
          if (!res.ok) throw new Error(`input ${res.status}`);
          if (inputBroken) {
            inputBroken = false;
            cb.current.onInputProblem(null);
          }
          reportExpiry(await res.json().catch(() => ({})));
        }
      } catch {
        if (!disposed && !abort.signal.aborted) {
          pending = "";
          inputBroken = true;
          cb.current.onInputProblem("Your last keys were not delivered. Check your connection.");
        }
      } finally {
        sending = false;
      }
    };

    const send = (data: string) => {
      pending += data;
      void flush();
    };

    // ----- size -----
    let lastSent = "";
    const sendSize = async (cols: number, rows: number) => {
      const key = `${cols}x${rows}`;
      if (key === lastSent || ended) return;
      lastSent = key;
      try {
        await fetch(`${base}/resize`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cols, rows }),
          signal: abort.signal,
        });
      } catch {
        lastSent = "";
      }
    };

    // ----- output stream -----
    const runStream = async () => {
      let attempt = 0;
      while (!disposed && !ended) {
        try {
          const res = await fetch(`${base}/stream`, {
            headers: { accept: "text/event-stream" },
            cache: "no-store",
            signal: abort.signal,
          });
          if (res.status === 404) {
            ended = true;
            cb.current.onEnd("gone");
            return;
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let cut: number;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const block = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              let name = "message";
              let data = "";
              for (const line of block.split("\n")) {
                if (line.startsWith("event:")) name = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
              }
              if (name === "ready") {
                attempt = 0;
                // The server replays its buffered tail after this, so start from a clean screen.
                term?.reset();
                cb.current.onLive(true);
              } else if (name === "out" && data) {
                term?.write(base64ToBytes(data));
              } else if (name === "end") {
                ended = true;
                let reason: ScreenEnd = "error";
                try {
                  reason = (JSON.parse(data) as { reason: ScreenEnd }).reason;
                } catch {
                  // Keep the generic reason.
                }
                cb.current.onEnd(reason);
                return;
              }
            }
          }
        } catch {
          if (disposed || abort.signal.aborted) return;
        }
        if (disposed || ended) return;
        // The stream dropped without an end event: try again a few times.
        cb.current.onLive(false);
        const delay = RECONNECT_DELAYS_MS[attempt];
        if (delay === undefined) {
          cb.current.onFail("Lost the connection to the terminal. The shell may still be running.");
          return;
        }
        attempt += 1;
        await new Promise((r) => setTimeout(r, delay));
      }
    };

    // ----- xterm -----
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        lineHeight: 1.25,
        cursorBlink: !reduceMotion,
        scrollback: 5000,
        theme: readTheme(host),
        allowProposedApi: false,
      });
      term = t;
      const fit = new FitAddon();
      t.loadAddon(fit);
      t.open(host);

      let lastEscape = 0;
      t.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const key = e.key.toLowerCase();
        // Escape, then Tab: hand the keyboard back to the page.
        if (e.key === "Escape") lastEscape = Date.now();
        if (e.key === "Tab" && !e.shiftKey && Date.now() - lastEscape < ESCAPE_TAB_WINDOW_MS) {
          e.preventDefault();
          lastEscape = 0;
          cb.current.onLeave();
          return false;
        }
        // Copy: Ctrl+Shift+C or Ctrl+Insert. Plain Ctrl+C stays an interrupt.
        if ((e.ctrlKey && e.shiftKey && key === "c") || (e.ctrlKey && e.key === "Insert")) {
          const text = t.getSelection();
          if (text) void navigator.clipboard?.writeText(text).catch(() => {});
          e.preventDefault();
          return false;
        }
        // Paste: Ctrl+V or Ctrl+Shift+V. The browser's paste event delivers the text.
        if (e.ctrlKey && !e.altKey && key === "v") return false;
        return true;
      });

      t.onData(send);

      const fitNow = () => {
        if (disposed) return;
        const dims = fit.proposeDimensions();
        if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
        const cols = clamp(dims.cols, MIN_COLS, MAX_COLS);
        const rows = clamp(dims.rows, MIN_ROWS, MAX_ROWS);
        if (cols !== t.cols || rows !== t.rows) t.resize(cols, rows);
      };
      t.onResize(({ cols, rows }) => void sendSize(cols, rows));

      // Refit when the box changes, once resizing pauses.
      sizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fitNow, 150);
      });
      sizeObserver.observe(host);

      // Follow the page theme (light, dark, system) without a reload.
      themeObserver = new MutationObserver(() => {
        t.options.theme = readTheme(host);
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });

      controls.current = {
        send,
        copy: () => {
          const text = t.getSelection();
          if (text) void navigator.clipboard?.writeText(text).catch(() => {});
          t.focus();
        },
        paste: () => {
          navigator.clipboard
            ?.readText()
            .then((text) => {
              if (text) t.paste(text);
            })
            .catch(() => {})
            .finally(() => t.focus());
        },
        focus: () => t.focus(),
      };

      fitNow();
      void sendSize(t.cols, t.rows);
      t.focus();
      void runStream();
    })();

    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(resizeTimer);
      sizeObserver?.disconnect();
      themeObserver?.disconnect();
      controls.current = null;
      term?.dispose();
      term = null;
    };
  }, [projectId, sessionId]);

  const key = useCallback((data: string) => controls.current?.send(data), []);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keeps the soft keyboard open

  return (
    <div>
      <div
        ref={hostRef}
        role="group"
        aria-label={props.label}
        className="h-[clamp(280px,62dvh,720px)] w-full overflow-hidden rounded-lg bg-background shadow-border-small focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring [&_.xterm]:p-2"
      />
      <div
        role="toolbar"
        aria-label="Terminal keys"
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <Button type="button" variant="outline" onMouseDown={keep} onClick={() => controls.current?.copy()}>
          <CopyIcon aria-hidden="true" data-icon="inline-start" />
          Copy
        </Button>
        <Button type="button" variant="outline" onMouseDown={keep} onClick={() => controls.current?.paste()}>
          <ClipboardTextIcon aria-hidden="true" data-icon="inline-start" />
          Paste
        </Button>
        <Button type="button" variant="outline" onMouseDown={keep} onClick={() => key("\x03")}>
          Ctrl+C
        </Button>
        <Button
          type="button"
          variant="outline"
          onMouseDown={keep}
          onClick={() => key("\t")}
          className="hidden max-sm:inline-flex pointer-coarse:inline-flex"
        >
          Tab
        </Button>
        <Button
          type="button"
          variant="outline"
          onMouseDown={keep}
          onClick={() => key("\x1b")}
          className="hidden max-sm:inline-flex pointer-coarse:inline-flex"
        >
          Esc
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Arrow up"
          onMouseDown={keep}
          onClick={() => key("\x1b[A")}
          className="hidden max-sm:inline-flex pointer-coarse:inline-flex"
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Arrow down"
          onMouseDown={keep}
          onClick={() => key("\x1b[B")}
          className="hidden max-sm:inline-flex pointer-coarse:inline-flex"
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
