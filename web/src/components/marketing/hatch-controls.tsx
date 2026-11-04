"use client";

import { useEffect, useState } from "react";

/**
 * A real button for the hero toy, so it works from the keyboard, and a line
 * that keeps count. The canvas announces progress with a `nest:state` event.
 */
export function HatchControls() {
  const [hatched, setHatched] = useState(0);

  useEffect(() => {
    const on = (e: Event) => setHatched((e as CustomEvent<{ hatched: number }>).detail.hatched);
    window.addEventListener("nest:state", on);
    return () => window.removeEventListener("nest:state", on);
  }, []);

  const message =
    hatched === 0
      ? "Those eggs look deployable."
      : hatched < 3
        ? `${hatched} of 3 live.`
        : "3 of 3 live.";

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("nest:hatch"))}
        className="font-medium underline decoration-2 underline-offset-4 outline-offset-4 transition-opacity hover:opacity-70 active:scale-[0.97]"
      >
        {hatched === 3 ? "Start over" : "Hatch an egg"}
      </button>
      <span aria-live="polite" className="opacity-75">
        {message}
      </span>
    </p>
  );
}
