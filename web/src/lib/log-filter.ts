/**
 * Runtime log helpers shared by the logs page (browser) and the log reader
 * (server): the time range, the level filter and the download file.
 */

export type LogRange = "1h" | "24h" | "7d";
export type LogLevel = "all" | "problems";

export const LOG_RANGES: { value: LogRange; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

/** The widest window, and the one used when nothing is chosen. */
export const DEFAULT_LOG_RANGE: LogRange = "7d";

/** journalctl `--since` values. Only these strings ever reach the shell. */
const SINCE: Record<LogRange, string> = {
  "1h": "1 hour ago",
  "24h": "24 hours ago",
  "7d": "7 days ago",
};

export function journalSince(range: LogRange): string {
  return SINCE[range];
}

export function parseLogRange(value: string | null | undefined): LogRange {
  return value === "1h" || value === "24h" || value === "7d" ? value : DEFAULT_LOG_RANGE;
}

export function parseLogLevel(value: string | null | undefined): LogLevel {
  return value === "problems" ? "problems" : "all";
}

export type LineLevel = "error" | "warn" | "info";

/**
 * Deliberately simple: the journal lines carry no priority field, so the level
 * is read from the words in the text. A whole word (any case) from the error
 * list makes the line an error, one from the warning list makes it a warning,
 * everything else is info. A message that does not say so (for example a stack
 * trace line) is not caught, and a line that mentions "error" in passing is.
 */
const ERROR_WORDS = /\b(error|errors|err|fatal|critical|crit|panic|exception|failed|failure|traceback)\b/i;
const WARN_WORDS = /\b(warn|warning|warnings|deprecated)\b/i;

export function lineLevel(line: string): LineLevel {
  if (ERROR_WORDS.test(line)) return "error";
  if (WARN_WORDS.test(line)) return "warn";
  return "info";
}

/** "problems" keeps warnings and errors; "all" keeps every line. */
export function filterByLevel(lines: string[], level: LogLevel): string[] {
  if (level === "all") return lines;
  return lines.filter((l) => lineLevel(l) !== "info");
}

/** The text of a downloaded log: one line per line, ending in a newline. */
export function logFileText(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** e.g. "recipe-api-logs-24h-2026-11-05.txt". */
export function logFileName(project: string, range: LogRange, now = new Date()): string {
  const slug =
    project
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `${slug}-logs-${range}-${now.toISOString().slice(0, 10)}.txt`;
}
