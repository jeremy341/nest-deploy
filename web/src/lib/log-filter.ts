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

/*
 * Level detection. The journal text carries no priority field, so the level is
 * read from the line itself. The rules run in this order and the first one that
 * applies decides:
 *
 *  1. An explicit level the program printed: `[ERROR]`, `level=warn`,
 *     `"level":"error"`, `severity: fatal`, or a pino number (`"level":50`).
 *     It is trusted either way, so `[INFO] failed login` stays info.
 *  2. systemd's own priority marker at the start of a message: `<0>` to `<3>`
 *     is an error, `<4>` a warning, `<5>` to `<7>` info.
 *  3. Counts of zero are blanked out first ("0 errors", "errors: 0",
 *     "no warnings", "without errors", "error-free"), so they do not trigger 4.
 *  4. Error shapes: the words error, err, fatal, critical, panic, exception,
 *     failed, failure, traceback; `npm ERR!`; Node codes such as `ERR_X`;
 *     a class name ending in Error or Exception followed by a colon
 *     (`TypeError:`, `java.lang.NullPointerException:`); a Python
 *     `File "x", line N` line; a Node or Java stack frame (`    at f (a.js:1:2)`);
 *     and systemd failure statuses (`code=killed`, `status=1/FAILURE`).
 *  5. The words warn, warning, deprecated: a warning.
 *  6. Anything else is info.
 *
 * Start-of-line checks look at the message, not at the journal prefix
 * ("Nov 05 10:00:03 host app[123]: ") that comes before it.
 */

/** The syslog-style prefix journalctl adds, with or without an ISO timestamp. */
const JOURNAL_PREFIX =
  /^(?:[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+\S+\s+[^\s:[]+(?:\[\d+\])?:\s?/;

/** The message part of a journal line: everything after the prefix. */
function messageOf(line: string): string {
  return line.replace(JOURNAL_PREFIX, "");
}

const LEVEL_WORDS: Record<string, LineLevel> = {
  emerg: "error",
  emergency: "error",
  alert: "error",
  crit: "error",
  critical: "error",
  fatal: "error",
  panic: "error",
  severe: "error",
  err: "error",
  error: "error",
  warn: "warn",
  warning: "warn",
  notice: "info",
  info: "info",
  information: "info",
  debug: "info",
  trace: "info",
  verbose: "info",
};

const PINO_LEVELS: Record<string, LineLevel> = {
  "10": "info",
  "20": "info",
  "30": "info",
  "40": "warn",
  "50": "error",
  "60": "error",
};

const LEVEL_NAME = Object.keys(LEVEL_WORDS).join("|");
/** `[ERROR]`, `[ warn ]` */
const BRACKET_LEVEL = new RegExp(`\\[\\s*(${LEVEL_NAME})\\s*\\]`, "i");
/** `level=warn`, `"level":"error"`, `severity: fatal`, `"level":50` */
const KEY_LEVEL = /["']?\b(?:level|lvl|loglevel|levelname|severity)["']?\s*[:=]\s*["']?([A-Za-z]+|\d{2})\b/i;
/** `<3>` at the start of a message. */
const SYSTEMD_PRIORITY = /^<([0-7])>/;

function explicitLevel(msg: string): LineLevel | null {
  const candidates: { at: number; level: LineLevel }[] = [];

  const bracket = BRACKET_LEVEL.exec(msg);
  if (bracket) candidates.push({ at: bracket.index, level: LEVEL_WORDS[bracket[1].toLowerCase()] });

  const kv = KEY_LEVEL.exec(msg);
  if (kv) {
    const raw = kv[1].toLowerCase();
    const level = LEVEL_WORDS[raw] ?? PINO_LEVELS[raw];
    if (level) candidates.push({ at: kv.index, level });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.at - b.at)[0].level;
}

const PROBLEM_NOUNS = "errors?|warnings?|failures?|exceptions?|failed";
/** "0 errors", "no warnings", "without errors", "no new errors" */
const ZERO_BEFORE = new RegExp(
  `\\b(?:no|zero|0|without)\\s+(?:(?:new|more|further|other|critical|fatal|unhandled|compile|build|type)\\s+)?(?:${PROBLEM_NOUNS})(?:\\(s\\))?\\b`,
  "gi"
);
/** "errors: 0", "warnings=0" */
const ZERO_AFTER = new RegExp(`\\b(?:${PROBLEM_NOUNS}|fatal|critical)\\s*[:=]\\s*0(?![\\d.])`, "gi");
/** "error-free" */
const ERROR_FREE = /\berror[- ]free\b/gi;

function withoutZeroCounts(msg: string): string {
  // "errors=0 warnings=0" holds a "0 warnings" inside it, so the label=0 form goes first.
  return msg.replace(ZERO_AFTER, " ").replace(ZERO_BEFORE, " ").replace(ERROR_FREE, " ");
}

const ERROR_WORDS =
  /\b(?:error|errors|err|fatal|critical|crit|emerg|emergency|panic|exception|exceptions|failed|failure|traceback)\b/i;
const WARN_WORDS = /\b(?:warn|warning|warnings|deprecated)\b/i;
/** npm: `npm ERR! code ELIFECYCLE`. */
const NPM_ERR = /\bERR!/;
/** Node error codes: `code: 'ERR_MODULE_NOT_FOUND'`. */
const NODE_ERR_CODE = /\bERR_[A-Z0-9_]+\b/;
/** `TypeError:`, `ValueError:`, `java.lang.IllegalStateException:` (capitalised on purpose). */
const ERROR_CLASS = /\b[A-Z][A-Za-z0-9_$]*(?:Error|Exception)\s*:/;
/** `Error: message` at the start of the message. */
const ERROR_AT_START = /^\s*(?:Uncaught\s+)?Error\s*:/i;
/** Python: `  File "app.py", line 3, in <module>`. */
const PY_FILE = /^\s*File\s+"[^"]*",\s+line\s+\d+/;
/** Node/Java frame: `    at Object.<anonymous> (/app/server.js:12:5)`, `    at Foo.bar(Foo.java:42)`. */
const STACK_FRAME =
  /^\s+at\s+\S.*(?::\d+:\d+\)?|\(<anonymous>\)|\(native\)|\(index \d+\)|\([^()\s]+:\d+\))\s*$/;
/** systemd: `code=killed`, `code=dumped`, `status=1/FAILURE`. */
const SYSTEMD_FAILURE = /\bcode=(?:killed|dumped)\b|\bstatus=[1-9]\d*\//;

/**
 * Classifies one line as "error", "warn" or "info" from its own text, using the
 * rules listed above. Pure: the same line always gives the same answer, and no
 * other line is looked at. For stack traces use `lineLevels`, which also lets
 * the continuation lines of a trace take the level of the error above them.
 */
export function lineLevel(line: string): LineLevel {
  const msg = messageOf(line);

  const explicit = explicitLevel(msg);
  if (explicit) return explicit;

  const priority = SYSTEMD_PRIORITY.exec(msg);
  if (priority) {
    const n = Number(priority[1]);
    return n <= 3 ? "error" : n === 4 ? "warn" : "info";
  }

  const text = withoutZeroCounts(msg);
  if (
    ERROR_WORDS.test(text) ||
    NPM_ERR.test(text) ||
    NODE_ERR_CODE.test(text) ||
    ERROR_CLASS.test(text) ||
    ERROR_AT_START.test(text) ||
    PY_FILE.test(text) ||
    STACK_FRAME.test(text) ||
    SYSTEMD_FAILURE.test(text)
  ) {
    return "error";
  }
  if (WARN_WORDS.test(text)) return "warn";
  return "info";
}

/** A loose frame with no position (`    at async Promise.all`). */
const LOOSE_FRAME = /^\s+at\s+\S/;
/** A source pointer under a code excerpt: `    ^^^^`, `    ~~~^~~`. */
const CARET_LINE = /^\s*[\^~]+\s*$/;
/** Java: `    ... 12 more`. */
const MORE_FRAMES = /^\s*\.{3}\s*\d+\s+(?:more|common frames omitted)\b/;
/** Node prints its version after an uncaught crash. */
const NODE_TRAILER = /^\s*Node\.js v\d/;

/**
 * Levels for a list of consecutive lines, one per line, in order.
 *
 * Every line gets its own level from `lineLevel`. On top of that, a line that
 * belongs to the stack trace under an error line takes the error level too,
 * even if it says nothing itself:
 *  - a frame without a position (`    at async Promise.all`),
 *  - the source line printed under a Python `File "...", line N` line,
 *  - caret pointers (`^^^^`), Java `... 12 more`, and Node's version trailer.
 * The block ends at the first line that is not part of a trace, so a normal
 * line after a trace is info again. Warnings never start a block.
 */
export function lineLevels(lines: string[]): LineLevel[] {
  const levels: LineLevel[] = [];
  let inTrace = false;
  let afterPyFile = false;

  for (const line of lines) {
    const own = lineLevel(line);
    const msg = messageOf(line);
    const isPyFile = PY_FILE.test(msg);

    if (own === "error") {
      levels.push("error");
      inTrace = true;
    } else if (
      inTrace &&
      (LOOSE_FRAME.test(msg) ||
        CARET_LINE.test(msg) ||
        MORE_FRAMES.test(msg) ||
        NODE_TRAILER.test(msg) ||
        (afterPyFile && /^\s+\S/.test(msg)))
    ) {
      levels.push("error");
    } else {
      levels.push(own);
      inTrace = false;
    }
    afterPyFile = isPyFile;
  }
  return levels;
}

/**
 * "problems" keeps warnings and errors; "all" keeps every line. Stack trace
 * lines under an error are kept with it, so a trace is never cut in half.
 */
export function filterByLevel(lines: string[], level: LogLevel): string[] {
  if (level === "all") return lines;
  const levels = lineLevels(lines);
  return lines.filter((_, i) => levels[i] !== "info");
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
