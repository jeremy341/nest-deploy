"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A grid of pixels that reacts to a click.
 *
 * Click or tap the background: a drop hits the grid and one circular wave
 * spreads outward from the point, a bright crest at the front with a short soft
 * wake, like a drop on still water. Several waves can run at once: a new click
 * never cuts an older wave short, and where two crests cross they add up and
 * flare brighter, like ripples meeting on water. Nothing stays lit once the
 * waves have passed. Clicks on fields,
 * buttons and links are ignored, so typing and using the page never splashes.
 * It never starts by itself, and there is no hover effect.
 *
 * It draws a live canvas that only paints pixels that are currently lit (the
 * hairlines are drawn by the base canvas, or by the page when `fixed`). The
 * loop sleeps when nothing is moving, and when the grid is offscreen or the tab
 * hidden. With reduced motion there are no waves at all.
 *
 * With `fixed` it covers the viewport behind the whole page. Clicks are heard
 * on the window, so the canvas never blocks anything.
 */

type Props = {
  /** Distance between pixel centres, in CSS pixels. */
  cell?: number;
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
const FRONT = 32; // width of the leading crest
const TAIL = 80; // how far the light trails off behind the crest
const MAX_DROPS = 8; // enough for fast clicking; the oldest fades out first anyway

/**
 * Brightness (0..1) of the drop at distance `d` from where it landed, `age`
 * seconds after it landed. One ring: a sharp crest at the front with a short
 * soft wake behind it. It thins out as it spreads and as it ages.
 */
function dropWave(d: number, age: number): number {
  const radius = age * WAVE_SPEED;
  const behind = radius - d; // > 0 once the crest has passed this pixel
  if (behind < -FRONT * 2.5 || behind > TAIL * 4) return 0;
  const strength =
    Math.pow(Math.max(0, 1 - age / WAVE_LIFE), 1.4) / Math.sqrt(1 + radius / 240);
  const shape = behind < 0 ? Math.exp(-((behind / FRONT) ** 2)) : Math.exp(-behind / TAIL);
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
    // The resting grid is hairlines between the cells. A lit pixel is a box that
    // swells from the middle of its cell until it fills it, inside the lines.
    const REST = Math.round(cell * 0.4);
    const max = cell - 6; // leaves a clear gap to the hairlines on every side
    const litCap = tone === "mono" ? 0.5 : 0.92;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let dot: RGB = [128, 128, 128];
    let dotAlpha = 0.2;
    let brand: RGB = [255, 90, 31];
    let ripples: Ripple[] = [];
    let visible = true;
    let raf = 0;

    const px = (v: number) => Math.round(v * dpr) / dpr;
    /** In `fixed` mode the grid scrolls with the page, so the cells sit this far up. */
    const originY = () => (fixed ? -(window.scrollY % cell) : 0);

    function readColors() {
      const cs = getComputedStyle(host);
      if (tone === "mono") {
        const ink = parseColor(cs.color);
        dot = [ink[0], ink[1], ink[2]];
        dotAlpha = 0.12; // the hairlines
        brand = [ink[0], ink[1], ink[2]];
        return;
      }
      const d = parseColor(cs.getPropertyValue("--pixel-dot") || "rgb(128 128 128 / 0.2)");
      const b = parseColor(cs.getPropertyValue("--brand") || "#ff5a1f");
      dot = [d[0], d[1], d[2]];
      dotAlpha = Math.min(d[3], 0.12); // the hairlines
      brand = [b[0], b[1], b[2]];
    }

    function paintBase() {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, w, h);
      if (fixed) return; // the page draws its own hairlines, so they cover the whole height
      bctx.fillStyle = `rgb(${dot[0]} ${dot[1]} ${dot[2]} / ${dotAlpha})`;
      const line = 1 / dpr; // one device pixel
      for (let i = 0; i <= cols; i++) bctx.fillRect(px(i * cell), 0, line, h);
      for (let j = 0; j <= rows; j++) bctx.fillRect(0, px(j * cell), w, line);
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
      rows = Math.ceil(h / cell) + (fixed ? 1 : 0);
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
      const a = Math.min(litCap, v * litCap);
      lctx.fillStyle = `rgb(${r} ${g} ${b} / ${a.toFixed(3)})`;
      lctx.fillRect(px(cx - size / 2), px(cy - size / 2), Math.round(size * dpr) / dpr, Math.round(size * dpr) / dpr);
    }

    function frame(t: number) {
      raf = 0;
      const now = t / 1000;

      ripples = ripples.filter((r) => now - r.t0 < WAVE_LIFE);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);

      let alive = ripples.length > 0;

      const oy = originY();
      for (let j = 0; j < rows; j++) {
        const cy = (j + 0.5) * cell + oy;
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5) * cell;

          // Waves add up where they meet: the brightest one counts in full and
          // every other one adds on top, so crossing crests flare instead of
          // one wave simply hiding the other.
          let peak = 0;
          let sum = 0;
          for (const r of ripples) {
            const dx = cx - r.x;
            const dy = cy - r.y;
            const v = dropWave(Math.sqrt(dx * dx + dy * dy), now - r.t0);
            sum += v;
            if (v > peak) peak = v;
          }
          const wave = peak + (sum - peak) * 0.9;

          if (wave > 0.02) {
            drawLit(Math.min(1, wave), cx, cy);
            alive = true;
          }
        }
      }

      if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (reduced) return;
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function addDrop(x: number, y: number) {
      if (reduced) return;
      ripples.push({ x, y, t0: performance.now() / 1000 });
      if (ripples.length > MAX_DROPS) ripples.shift();
      wake();
    }

    function toLocal(e: PointerEvent) {
      const r = base.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height };
    }

    /** Things you click to use, not to make a splash: fields, buttons, links. */
    const INTERACTIVE = "input, textarea, select, button, a, label, summary, [contenteditable], [role='button']";

    const onDown = (e: PointerEvent) => {
      if (reduced) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      const p = toLocal(e);
      if (!p.inside) return;
      addDrop(p.x, p.y);
    };
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

    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("visibilitychange", wake);
    if (fixed) window.addEventListener("scroll", wake, { passive: true });
    resize();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("scroll", wake);
    };
  }, [cell, tone, fixed]);

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
