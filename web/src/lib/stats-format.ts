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

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-04" as "4 Nov". The strings are UTC calendar days. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}
