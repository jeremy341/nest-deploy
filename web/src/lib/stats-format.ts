/**
 * Pure helpers for the public stats figures. No imports, so the chart (a
 * client component) can use them without pulling server code into the bundle.
 */

/** A rounded figure: either "fewer than N" or a value rounded to two significant figures. */
export type Count = { lessThan: number } | { approx: number };

const number = new Intl.NumberFormat("en");

/** "fewer than 10" or "1,200". */
export function formatCount(c: Count): string {
  return "lessThan" in c ? `fewer than ${number.format(c.lessThan)}` : number.format(c.approx);
}

/** For a sentence: "fewer than 10", "about 1,200", or an exact "47" (rounding changes nothing under 100). */
export function describeCount(c: Count): string {
  if ("lessThan" in c) return formatCount(c);
  return c.approx >= 100 ? `about ${formatCount(c)}` : formatCount(c);
}

/** The approximate value, or 0 for a "fewer than" bound (which is never drawn to scale). */
export function countValue(c: Count): number {
  return "approx" in c ? c.approx : 0;
}

/** "42 s", "3 min 05 s" or "1 h 02 min". Whole seconds in, so nothing finer than a second is implied. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "00:00" to "23:00" as the start of a UTC hour. */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export type Direction = "up" | "down" | "same";

export const DIRECTION_WORDS: Record<Direction, string> = {
  up: "Up",
  down: "Down",
  same: "About the same",
};

const dayFormat =new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-04" as "4 Nov". The strings are UTC calendar days. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}
