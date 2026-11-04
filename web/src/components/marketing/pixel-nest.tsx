"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The hero. A field of pixels with a pixel-art nest drawn into it, and three
 * eggs. Click an egg and it hatches. Click anywhere else and a ring of light
 * spreads through the grid; move the cursor and the pixels swell behind it.
 *
 * Everything is drawn on one canvas, only while something is moving. The art
 * is authored in code as shapes on a 44 by 26 grid of cells.
 *
 * Keyboard and assistive tech can hatch eggs with the `nest:hatch` window
 * event (see HatchControls). With reduced motion there are no waves or
 * wobbles and hatching is instant.
 */

const SW = 44;
const SH = 26;

const INK = "#14110F";
const CREAM = "#FFF3E3";
const YELLOW = "#FFD23F";
const DARK = "#B93A0B";
const SHELL = "#F0D3B0";

const EGG_X = [11, 22, 33];
const EGG_Y = 10;
const EGG_HALF = [1, 2, 3, 3, 4, 4, 4, 4, 4, 3, 3, 2, 1]; // dy -6..6
const SPECKLES: [number, number][] = [
  [-1, -2],
  [2, 1],
  [-2, 3],
];
const CRACK: [number, number][] = [
  [-3, 0],
  [-2, 1],
  [-1, 0],
  [0, 1],
  [1, 0],
  [2, 1],
  [3, 0],
];
const CHICK = [
  "..yyy..",
  ".yyyyy.",
  "yy#y#yy",
  "yyydyyy",
  "yyyyyyy",
  ".yyyyy.",
  "..d.d..",
];

const HATCH_MS = 1100;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

type Egg = { t0: number | null; hatched: boolean; wobble: number | null };

export function PixelNest({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const host = canvas.parentElement!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let c = 14; // cell size, CSS px
    let cols = 0;
    let rows = 0;
    let ox = 0;
    let oy = 0;
    let trail = new Float32Array(0);
    let glow = new Float32Array(0);
    let ripples: { x: number; y: number; t0: number }[] = [];
    let pointer: { x: number; y: number } | null = null;
    const eggs: Egg[] = EGG_X.map(() => ({ t0: null, hatched: false, wobble: null }));
    let visible = true;
    let raf = 0;
    let last = 0;
    let wobbleTimer: ReturnType<typeof setTimeout> | undefined;

    const px = (v: number) => Math.round(v * dpr) / dpr;

    function resize() {
      const r = host.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const wide = w >= 900;
      c = wide ? 14 : Math.max(6, Math.min(12, Math.floor((w - 32) / SW)));
      cols = Math.ceil(w / c);
      rows = Math.ceil(h / c);
      trail = new Float32Array(cols * rows);
      glow = new Float32Array(cols * rows);
      const sceneW = SW * c;
      const sceneH = SH * c;
      ox = wide ? Math.round(w - sceneW - Math.max(24, w * 0.05)) : Math.round((w - sceneW) / 2);
      oy = Math.round(h - sceneH - (wide ? 32 : 20));
      wake();
    }

    function cell(x: number, y: number, color: string, size = c - 1) {
      ctx.fillStyle = color;
      const s = Math.round(size * dpr) / dpr;
      ctx.fillRect(px(ox + x * c + (c - size) / 2), px(oy + y * c + (c - size) / 2), s, s);
    }

    function eggCells(i: number, from: number, to: number, dx = 0, dy = 0) {
      const cx = EGG_X[i] + dx;
      for (let r = from; r <= to; r++) {
        const half = EGG_HALF[r + 6];
        for (let q = -half; q <= half; q++) {
          const edge = Math.abs(q) === half || r === -6 || r === 6;
          let col = edge ? INK : q >= half - 1 ? SHELL : CREAM;
          if (!edge && SPECKLES.some(([sx, sy]) => sx === q && sy === r)) col = INK;
          cell(cx + q, EGG_Y + r + dy, col);
        }
      }
    }

    function drawBowl() {
      const cy0 = 15;
      for (let y = cy0; y < SH; y++) {
        const dy = y - cy0;
        const half = Math.floor(21 * Math.sqrt(Math.max(0, 1 - Math.pow(dy / 10.5, 2))));
        for (let x = 22 - half; x <= 22 + half; x++) {
          let col = (x + y) % 4 === 0 || (y % 3 === 1 && x % 5 === 0) ? DARK : INK;
          if (y === cy0) col = DARK;
          cell(x, y, col);
        }
      }
      // a twig poking out of the left side
      for (let x = 0; x < 6; x++) cell(x, 19 + (x > 3 ? -1 : 0), INK);
      cell(2, 18, DARK);
      cell(4, 17, DARK);
    }

    function drawChick(top: number, cx: number, bob: number) {
      CHICK.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === ".") continue;
          cell(cx - 3 + rx, top + ry + bob, ch === "y" ? YELLOW : ch === "d" ? DARK : INK);
        }
      });
    }

    function drawScene(now: number) {
      let hatchedCount = 0;
      for (let i = 0; i < eggs.length; i++) {
        const e = eggs[i];
        let p = e.hatched ? 1 : 0;
        if (e.t0 !== null) {
          p = clamp((now - e.t0) / HATCH_MS);
          if (p >= 1) {
            e.t0 = null;
            e.hatched = true;
            emit();
          }
        }
        if (e.hatched) hatchedCount++;

        if (p === 0) {
          let dx = 0;
          if (e.wobble !== null) {
            const t = (now - e.wobble) / 450;
            if (t >= 1) e.wobble = null;
            else dx = Math.floor(t * 8) % 2 === 0 ? -1 : 1;
          }
          eggCells(i, -6, 6, dx);
        } else if (p < 0.4) {
          const shake = Math.floor(now / 55) % 2 === 0 ? -1 : 1;
          eggCells(i, -6, 6, shake);
          const n = Math.floor((p / 0.4) * CRACK.length) + 1;
          for (let k = 0; k < Math.min(n, CRACK.length); k++) {
            cell(EGG_X[i] + CRACK[k][0] + shake, EGG_Y + CRACK[k][1], INK);
          }
        } else {
          const q = e.hatched ? 1 : (p - 0.4) / 0.6;
          eggCells(i, 1, 6); // bottom half stays
          const bob = e.hatched && !reduced ? Math.floor(now / 520 + i) % 2 : 0;
          drawChick(Math.round(15 - 7 * ease(q)), EGG_X[i], bob);
          if (q < 0.85) {
            // the top of the shell pops off and falls away
            eggCells(i, -6, 0, Math.round(q * 4), -Math.round(ease(q) * 9) + Math.round(q * q * 6));
          }
        }
      }
      drawBowl();
      if (hatchedCount > 0) {
        for (let y = 3; y < 16; y++) cell(40, y, INK);
        const wave = Math.floor(now / 400) % 2;
        for (let y = 3; y < 6; y++) {
          for (let x = 41; x < 44; x++) cell(x, y + (x === 43 ? wave : 0), CREAM);
        }
      }
    }

    function emit() {
      const hatched = eggs.filter((e) => e.hatched).length;
      window.dispatchEvent(new CustomEvent("nest:state", { detail: { hatched, total: eggs.length } }));
    }

    function frame(t: number) {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      const now = performance.now();
      const nowS = now / 1000;
      const keepT = Math.exp(-dt / 0.34);
      const keepG = Math.exp(-dt / 1.6);
      ripples = ripples.filter((r) => nowS - r.t0 < 2.3);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let alive = ripples.length > 0 || pointer !== null || eggs.some((e) => e.t0 !== null || e.wobble !== null);

      // background pixels
      for (let j = 0; j < rows; j++) {
        const cy = (j + 0.5) * c;
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const cx = (i + 0.5) * c;
          let hover = 0;
          if (pointer) {
            const dx = cx - pointer.x;
            const dy = cy - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 184 * 184 * 4) hover = Math.exp((-d2 / (92 * 92)) * 1.5) * 0.9;
          }
          trail[k] = Math.max(trail[k] * keepT, hover);
          if (trail[k] < 0.012) trail[k] = 0;
          glow[k] *= keepG;
          if (glow[k] < 0.012) glow[k] = 0;

          let wave = 0;
          for (const r of ripples) {
            const age = nowS - r.t0;
            const d = Math.hypot(cx - r.x, cy - r.y);
            const fade = Math.pow(1 - age / 2.3, 1.6);
            const ring = Math.exp(-(((d - age * 430) / 34) ** 2));
            const echo = Math.exp(-(((d - age * 258) / 41) ** 2)) * 0.42;
            wave = Math.max(wave, (ring + echo) * fade);
          }
          const v = Math.max(trail[k], glow[k], wave);
          const size = 2 + (c - 4) * Math.pow(Math.min(1, v), 0.8);
          ctx.fillStyle = v > 0.02 ? `rgb(255 243 227 / ${(0.3 + v * 0.7).toFixed(3)})` : "rgb(20 17 15 / 0.2)";
          const s = Math.round(size * dpr) / dpr;
          ctx.fillRect(px(cx - size / 2), px(cy - size / 2), s, s);
          if (v > 0.02) alive = true;
        }
      }

      drawScene(now);
      if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (reduced) {
        frame(performance.now());
        raf = 0;
        return;
      }
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function addDrop(x: number, y: number) {
      if (reduced) return;
      ripples.push({ x, y, t0: performance.now() / 1000 });
      if (ripples.length > 6) ripples.shift();
      const i = Math.floor(x / c);
      const j = Math.floor(y / c);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
          glow[jj * cols + ii] = Math.max(glow[jj * cols + ii], di === 0 && dj === 0 ? 1 : 0.5);
        }
      }
    }

    function toggleEgg(i: number) {
      const e = eggs[i];
      if (e.t0 !== null) return;
      if (e.hatched) {
        e.hatched = false;
      } else if (reduced) {
        e.hatched = true;
      } else {
        e.t0 = performance.now();
      }
      emit();
      wake();
    }

    function hatchNext() {
      const open = eggs.findIndex((e) => !e.hatched && e.t0 === null);
      if (open >= 0) toggleEgg(open);
      else eggs.forEach((_, i) => eggs[i].hatched && toggleEgg(i));
    }

    function local(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height };
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || reduced) return;
      const p = local(e);
      pointer = p.inside ? { x: p.x, y: p.y } : null;
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      if (!p.inside) return;
      const sx = Math.floor((p.x - ox) / c);
      const sy = Math.floor((p.y - oy) / c);
      const egg = EGG_X.findIndex((cx) => Math.abs(sx - cx) <= 5 && sy >= EGG_Y - 7 && sy <= EGG_Y + 6);
      if (egg >= 0) toggleEgg(egg);
      addDrop(p.x, p.y);
      wake();
    };
    const onLeave = () => {
      pointer = null;
      wake();
    };

    function scheduleWobble() {
      if (reduced) return;
      wobbleTimer = setTimeout(() => {
        const open = eggs.map((e, i) => (e.hatched || e.t0 !== null ? -1 : i)).filter((i) => i >= 0);
        if (open.length && visible && !document.hidden) {
          eggs[open[Math.floor(Math.random() * open.length)]].wobble = performance.now();
          wake();
        }
        scheduleWobble();
      }, 4200 + Math.random() * 3000);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting;
        if (visible) wake();
      },
      { threshold: 0 }
    );
    io.observe(host);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("nest:hatch", hatchNext);
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", wake);
    // Hatched chicks bob; a slow tick keeps them alive without a render loop.
    const idle = setInterval(() => {
      if (!raf && visible && !document.hidden && eggs.some((e) => e.hatched)) wake();
    }, 520);
    resize();
    scheduleWobble();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearInterval(idle);
      if (wobbleTimer) clearTimeout(wobbleTimer);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("nest:hatch", hatchNext);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      <canvas ref={ref} className="absolute inset-0 size-full" />
    </div>
  );
}
