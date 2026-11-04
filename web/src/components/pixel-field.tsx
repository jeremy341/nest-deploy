"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A grid of pixels that reacts to you.
 *
 *  - Move over it: pixels swell and take the accent colour, then cool down
 *    behind the cursor like a trail.
 *  - Click or tap anywhere: a drop hits the grid. The pixels light up and a
 *    circular wave spreads outward from the point, a bright crest at the front
 *    with a few fading rings trailing behind it, like a drop on still water.
 *    The pixel you hit stays lit a while longer.
 *  - Left alone, an occasional drop falls by itself (optional).
 *
 * It draws two canvases: a static layer of resting dots, and a live layer
 * that only paints pixels that are currently lit. The loop sleeps when
 * nothing is moving, and also when the grid is offscreen or the tab hidden.
 * With reduced motion there are no waves and no trails: hovering lights the
 * pixel under the cursor, and a click lights a block that stays until the next
 * click.
 *
 * With `fixed` it covers the viewport behind the whole page. Clicks are heard
 * on the window, so the canvas never blocks anything.
 */

type Props = {
  /** Distance between pixel centres, in CSS pixels. */
  cell?: number;
  /** Let a drop fall now and then without any input. */
  autoDrops?: boolean;
  /** "mono" lights pixels in the page's text colour instead of the accent. */
  tone?: "default" | "mono";
  /** Cover the viewport behind the page instead of filling the parent. */
  fixed?: boolean;
  className?: string;
};

type RGB = [number, number, number];
type Ripple = { x: number; y: number; t0: number };

const WAVE_SPEED = 520; // px per second
const WAVE_LIFE = 3.4; // seconds until a drop has fully died away
const FRONT = 34; // width of the leading crest
const RING_GAP = 84; // distance between the rings behind the crest
const TAIL = 230; // how far behind the crest the rings reach
const MAX_DROPS = 8;
const HOVER_RADIUS = 120;

/**
 * Brightness (0..1) of one drop at distance `d` from where it landed, `age`
 * seconds after it landed. Right at the front there is a sharp crest. Behind
 * it the surface rises and falls in rings that get weaker with distance from
 * the crest. The whole thing thins out as it spreads and as it ages.
 */
function dropWave(d: number, age: number): number {
  const radius = age * WAVE_SPEED;
  const behind = radius - d; // > 0 once the crest has passed this pixel
  if (behind < -FRONT * 2.5 || behind > TAIL * 4) return 0;
  const strength =
    Math.pow(Math.max(0, 1 - age / WAVE_LIFE), 1.4) / Math.sqrt(1 + radius / 240);
  const shape =
    behind < 0
      ? Math.exp(-((behind / FRONT) ** 2))
      : Math.exp(-behind / TAIL) * (0.5 + 0.5 * Math.cos((behind / RING_GAP) * 2 * Math.PI));
  return shape * strength * 1.25;
}

function parseColor(value: string): [number, number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillStyle = value.trim() || "#888";
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

export function PixelField({
  cell = 18,
  autoDrops = false,
  tone = "default",
  fixed = false,
  className,
}: Props) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const base = baseRef.current!;
    const live = liveRef.current!;
    const host = base.parentElement!;
    const bctx = base.getContext("2d")!;
    const lctx = live.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const REST = Math.max(2, Math.round(cell / 7)); // resting pixel size
    const max = cell - Math.max(4, Math.round(cell / 6)); // biggest a lit pixel gets

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let trail = new Float32Array(0);
    let glow = new Float32Array(0);
    let dot: RGB = [128, 128, 128];
    let dotAlpha = 0.2;
    let brand: RGB = [255, 90, 31];
    let ripples: Ripple[] = [];
    let pointer: { x: number; y: number } | null = null;
    let visible = true;
    let raf = 0;
    let last = 0;
    let drops: ReturnType<typeof setTimeout> | undefined;

    const px = (v: number) => Math.round(v * dpr) / dpr;

    function readColors() {
      const cs = getComputedStyle(host);
      if (tone === "mono") {
        const ink = parseColor(cs.color);
        dot = [ink[0], ink[1], ink[2]];
        dotAlpha = 0.14;
        brand = [ink[0], ink[1], ink[2]];
        return;
      }
      const d = parseColor(cs.getPropertyValue("--pixel-dot") || "rgb(128 128 128 / 0.2)");
      const b = parseColor(cs.getPropertyValue("--brand") || "#ff5a1f");
      dot = [d[0], d[1], d[2]];
      dotAlpha = d[3];
      brand = [b[0], b[1], b[2]];
    }

    function paintBase() {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, w, h);
      bctx.fillStyle = `rgb(${dot[0]} ${dot[1]} ${dot[2]} / ${dotAlpha})`;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5) * cell;
          const cy = (j + 0.5) * cell;
          bctx.fillRect(px(cx - REST / 2), px(cy - REST / 2), REST, REST);
        }
      }
    }

    function resize() {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [base, live]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      cols = Math.ceil(w / cell);
      rows = Math.ceil(h / cell);
      trail = new Float32Array(cols * rows);
      glow = new Float32Array(cols * rows);
      readColors();
      paintBase();
      wake();
    }

    function drawLit(v: number, cx: number, cy: number) {
      const size = REST + (max - REST) * Math.pow(v, 0.8);
      const mix = Math.min(1, v * 1.7);
      const r = Math.round(dot[0] + (brand[0] - dot[0]) * mix);
      const g = Math.round(dot[1] + (brand[1] - dot[1]) * mix);
      const b = Math.round(dot[2] + (brand[2] - dot[2]) * mix);
      const a = Math.min(0.92, dotAlpha + v * (1 - dotAlpha));
      lctx.fillStyle = `rgb(${r} ${g} ${b} / ${a.toFixed(3)})`;
      lctx.fillRect(px(cx - size / 2), px(cy - size / 2), Math.round(size * dpr) / dpr, Math.round(size * dpr) / dpr);
    }

    function frame(t: number) {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      const now = t / 1000;
      const keepT = Math.exp(-dt / 0.34);
      const keepG = Math.exp(-dt / 1.7);

      ripples = ripples.filter((r) => now - r.t0 < WAVE_LIFE);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);

      let alive = ripples.length > 0 || pointer !== null;

      for (let j = 0; j < rows; j++) {
        const cy = (j + 0.5) * cell;
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const cx = (i + 0.5) * cell;

          let hover = 0;
          if (pointer) {
            const dx = cx - pointer.x;
            const dy = cy - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < HOVER_RADIUS * HOVER_RADIUS * 4) {
              hover = Math.exp((-d2 / (HOVER_RADIUS * HOVER_RADIUS)) * 1.5) * 0.9;
            }
          }
          const tr = Math.max(trail[k] * keepT, hover);
          trail[k] = tr < 0.012 ? 0 : tr;
          const gl = glow[k] * keepG;
          glow[k] = gl < 0.012 ? 0 : gl;

          let wave = 0;
          for (const r of ripples) {
            const dx = cx - r.x;
            const dy = cy - r.y;
            wave = Math.max(wave, dropWave(Math.sqrt(dx * dx + dy * dy), now - r.t0));
          }

          const v = Math.max(trail[k], glow[k], wave);
          if (v > 0.02) {
            drawLit(Math.min(1, v), cx, cy);
            alive = true;
          }
        }
      }

      if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    /** Reduced motion: paint the current state once, no animation. */
    function drawStatic() {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          let v = glow[k];
          if (pointer) {
            const dx = (i + 0.5) * cell - pointer.x;
            const dy = (j + 0.5) * cell - pointer.y;
            if (dx * dx + dy * dy < (cell * 0.75) ** 2) v = 1;
          }
          if (v > 0) drawLit(v, (i + 0.5) * cell, (j + 0.5) * cell);
        }
      }
    }

    function wake() {
      if (reduced) {
        drawStatic();
        return;
      }
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function addDrop(x: number, y: number) {
      if (reduced) return;
      ripples.push({ x, y, t0: performance.now() / 1000 });
      if (ripples.length > MAX_DROPS) ripples.shift();
      const i = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
      const j = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
          const k = jj * cols + ii;
          glow[k] = Math.max(glow[k], di === 0 && dj === 0 ? 1 : 0.5);
        }
      }
      wake();
    }

    function toLocal(e: PointerEvent) {
      const r = base.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height };
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = toLocal(e);
      pointer = p.inside ? { x: p.x, y: p.y } : null;
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      if (!p.inside) return;
      if (reduced) {
        const i = Math.floor(p.x / cell);
        const j = Math.floor(p.y / cell);
        if (i >= 0 && j >= 0 && i < cols && j < rows) {
          const k = j * cols + i;
          glow[k] = glow[k] > 0 ? 0 : 1;
        }
        wake();
        return;
      }
      addDrop(p.x, p.y);
    };
    const onLeave = () => {
      pointer = null;
      wake();
    };

    function scheduleDrop(first = false) {
      if (!autoDrops || reduced) return;
      drops = setTimeout(
        () => {
          if (visible && !document.hidden && w > 0) {
            addDrop(w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.6));
          }
          scheduleDrop();
        },
        first ? 900 : 7000 + Math.random() * 6000
      );
    }

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) wake();
      },
      { threshold: 0 }
    );
    io.observe(host);
    const mo = new MutationObserver(() => {
      readColors();
      paintBase();
      wake();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", wake);
    resize();
    scheduleDrop(true);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (drops) clearTimeout(drops);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [cell, autoDrops, tone, fixed]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none inset-0", fixed ? "fixed -z-10" : "absolute", className)}
    >
      <canvas ref={baseRef} className="absolute inset-0 size-full" />
      <canvas ref={liveRef} className="absolute inset-0 size-full" />
    </div>
  );
}
