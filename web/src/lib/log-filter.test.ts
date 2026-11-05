import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOG_RANGE,
  filterByLevel,
  journalSince,
  lineLevel,
  lineLevels,
  type LineLevel,
  logFileName,
  logFileText,
  parseLogLevel,
  parseLogRange,
} from "@/lib/log-filter";

describe("time range", () => {
  it("maps each range to a journal --since value", () => {
    expect(journalSince("1h")).toBe("1 hour ago");
    expect(journalSince("24h")).toBe("24 hours ago");
    expect(journalSince("7d")).toBe("7 days ago");
  });

  it("falls back to the widest range for anything unknown", () => {
    expect(parseLogRange("24h")).toBe("24h");
    expect(parseLogRange("30d")).toBe(DEFAULT_LOG_RANGE);
    expect(parseLogRange("1 hour ago; rm -rf /")).toBe(DEFAULT_LOG_RANGE);
    expect(parseLogRange(null)).toBe(DEFAULT_LOG_RANGE);
  });
});

describe("level filter", () => {
  const lines = [
    "Nov 05 10:00:00 nest app[1]: Listening on port 3000",
    "Nov 05 10:00:01 nest app[1]: WARN cache is cold",
    "Nov 05 10:00:02 nest app[1]: Error: connect ECONNREFUSED 127.0.0.1:5432",
    "Nov 05 10:00:03 nest app[1]: request completed in 12ms",
    "Nov 05 10:00:04 nest app[1]: [warning] slow query",
    "Nov 05 10:00:05 nest systemd[1]: app.service: Failed with result 'exit-code'.",
    "Nov 05 10:00:06 nest app[1]: terror alert is not a word match",
  ];

  it("reads the level from whole words, any case", () => {
    expect(lineLevel(lines[0])).toBe("info");
    expect(lineLevel(lines[1])).toBe("warn");
    expect(lineLevel(lines[2])).toBe("error");
    expect(lineLevel(lines[4])).toBe("warn");
    expect(lineLevel(lines[5])).toBe("error");
    expect(lineLevel(lines[6])).toBe("info");
  });

  it("an error word wins over a warning word", () => {
    expect(lineLevel("warning: build failed")).toBe("error");
  });

  it("keeps a stack trace together with its error under the problems filter", () => {
    const trace = [
      "Nov 05 10:00:00 nest app[1]: listening",
      "Nov 05 10:00:01 nest app[1]: TypeError: x is not a function",
      "Nov 05 10:00:01 nest app[1]:     at async Promise.all",
      "Nov 05 10:00:02 nest app[1]: done",
    ];
    expect(filterByLevel(trace, "problems")).toEqual([trace[1], trace[2]]);
  });

  it("keeps every line for all, and only warnings and errors for problems", () => {
    expect(filterByLevel(lines, "all")).toEqual(lines);
    expect(filterByLevel(lines, "problems")).toEqual([lines[1], lines[2], lines[4], lines[5]]);
  });

  it("parses the level, defaulting to all", () => {
    expect(parseLogLevel("problems")).toBe("problems");
    expect(parseLogLevel("debug")).toBe("all");
    expect(parseLogLevel(undefined)).toBe("all");
  });
});

describe("lineLevel formats", () => {
  type Row = [name: string, line: string, expected: LineLevel];
  const check = (rows: Row[]) =>
    it.each(rows)("%s", (_name, line, expected) => {
      expect(lineLevel(line)).toBe(expected);
    });

  describe("bracketed and key=value levels", () => {
    check([
      ["[ERROR] uppercase", "[ERROR] db unreachable", "error"],
      ["[warn] lowercase", "2026/11/05 10:00:00 [warn] 12#12: upstream slow", "warn"],
      ["[ info ] with spaces", "[ info ] server started", "info"],
      ["nginx [error]", "2026/11/05 [error] 12#12: connect() failed", "error"],
      ["level=warn", 'time=10:00 level=warn msg="cache cold"', "warn"],
      ["level=error", 'level=error msg="boom"', "error"],
      ["json level error", '{"level":"error","msg":"boom"}', "error"],
      ["json level warning", '{"level":"warning","msg":"slow"}', "warn"],
      ["json level info", '{"level":"info","msg":"ok"}', "info"],
      ["pino numeric error", '{"level":50,"msg":"boom"}', "error"],
      ["pino numeric warn", '{"level":40,"msg":"slow"}', "warn"],
      ["pino numeric info", '{"level":30,"msg":"hi"}', "info"],
      ["severity: fatal", "severity: fatal out of memory", "error"],
      ["an explicit info beats a word in the text", "[INFO] failed login for bob", "info"],
      ["with a journal prefix", "Nov 05 10:00:03 nest app[42]: [ERROR] nope", "error"],
    ]);
  });

  describe("error class names", () => {
    check([
      ["TypeError:", "Nov 05 10:00:00 nest app[1]: TypeError: x is not a function", "error"],
      ["ReferenceError:", "ReferenceError: foo is not defined", "error"],
      ["Error: at line start", "Error: Cannot find module './x'", "error"],
      ["Error: after the journal prefix", "Nov 05 10:00:00 nest app[1]: Error: boom", "error"],
      ["any *Error:", "ValidationError: email is required", "error"],
      ["any *Exception:", "java.lang.NullPointerException: null", "error"],
      ["after Uncaught", "Uncaught TypeError: bad", "error"],
      ["Node ERR_ code", "code: 'ERR_MODULE_NOT_FOUND'", "error"],
      ["a class name without a colon is not enough", "ErrorBoundary mounted", "info"],
    ]);
  });

  describe("python tracebacks", () => {
    check([
      ["header", "Traceback (most recent call last):", "error"],
      ["File line", '  File "app.py", line 3, in <module>', "error"],
      ["File line with prefix", 'Nov 05 10:00:00 nest app[1]:   File "/srv/app.py", line 9, in run', "error"],
      ["final exception line", "ValueError: invalid literal for int()", "error"],
      ["a file mentioned in prose", 'opened File "x" fine', "info"],
    ]);
  });

  describe("stack frames", () => {
    check([
      ["node frame", "    at Object.<anonymous> (/app/server.js:12:5)", "error"],
      ["node frame with prefix", "Nov 05 10:00:00 nest app[1]:     at Module._compile (node:internal/modules/cjs/loader:1256:14)", "error"],
      ["node frame without parens", "    at /app/server.js:12:5", "error"],
      ["async frame", "    at async Promise.all (index 0)", "error"],
      ["java frame", "\tat com.acme.App.main(App.java:42)", "error"],
      ["frame needs a position or indent", "arrived at the station", "info"],
      ["a bare loose frame has no level of its own", "    at async Promise.all", "info"],
    ]);
  });

  describe("npm and systemd", () => {
    check([
      ["npm ERR!", "npm ERR! code ELIFECYCLE", "error"],
      ["npm WARN", "npm WARN deprecated left-pad@1.0.0", "warn"],
      ["systemd <3>", "<3>could not bind", "error"],
      ["systemd <0>", "<0>kernel panic", "error"],
      ["systemd <4>", "<4>disk almost full", "warn"],
      ["systemd <6>", "<6>started", "info"],
      ["failed unit", "app.service: Failed with result 'exit-code'.", "error"],
      ["killed", "app.service: Main process exited, code=killed, status=9/KILL", "error"],
      ["exit status", "app.service: Main process exited, code=exited, status=1/FAILURE", "error"],
      ["clean exit", "app.service: Main process exited, code=exited, status=0/SUCCESS", "info"],
    ]);
  });

  describe("words already supported", () => {
    check([
      ["error", "connection error", "error"],
      ["fatal", "FATAL: out of memory", "error"],
      ["panic", "panic: runtime error", "error"],
      ["critical", "critical failure in worker", "error"],
      ["exception", "unhandled exception in handler", "error"],
      ["failed", "request failed", "error"],
      ["warning", "Warning: deprecated option", "warn"],
      ["deprecated", "this api is deprecated", "warn"],
      ["plain text", "GET /health 200 3ms", "info"],
    ]);
  });

  describe("counts of zero are not problems", () => {
    check([
      ["0 errors", "build finished with 0 errors", "info"],
      ["errors: 0", "tests done, errors: 0", "info"],
      ["errors=0", "summary errors=0 warnings=0", "info"],
      ["no errors", "no errors found", "info"],
      ["no warnings", "lint passed, no warnings", "info"],
      ["0 warnings", "0 warnings, 0 errors", "info"],
      ["without errors", "finished without errors", "info"],
      ["no new errors", "no new errors since last run", "info"],
      ["error-free", "an error-free run", "info"],
      ["0 failed", "12 passed, 0 failed", "info"],
      ["a real count still counts", "build finished with 3 errors", "error"],
      ["ten is not zero", "10 errors in the queue", "error"],
      ["zero errors but a real warning", "0 errors, 2 warnings", "warn"],
      ["zero warnings but a real error", "no warnings, 1 error", "error"],
    ]);
  });
});

describe("lineLevels (stack trace blocks)", () => {
  const P = "Nov 05 10:00:00 nest app[1]: ";

  it("gives a Node stack trace after a TypeError the error level, and the next normal line info", () => {
    const lines = [
      `${P}server ready`,
      `${P}TypeError: Cannot read properties of undefined`,
      `${P}    at Object.<anonymous> (/app/server.js:12:5)`,
      `${P}    at async Promise.all`,
      `${P}    at Module._compile (node:internal/modules/cjs/loader:1256:14)`,
      `${P}Node.js v20.11.0`,
      `${P}request completed in 12ms`,
    ];
    expect(lineLevels(lines)).toEqual(["info", "error", "error", "error", "error", "error", "info"]);
  });

  it("does not let a loose frame become an error without an error above it", () => {
    expect(lineLevels(["server ready", "    at async Promise.all", "done"])).toEqual([
      "info",
      "info",
      "info",
    ]);
  });

  it("carries a Python traceback through its source lines", () => {
    const lines = [
      "starting",
      "Traceback (most recent call last):",
      '  File "app.py", line 3, in <module>',
      "    foo()",
      '  File "lib.py", line 9, in foo',
      "    return 1 / 0",
      "           ~~^~~",
      "ZeroDivisionError: division by zero",
      "restarting worker",
    ];
    expect(lineLevels(lines)).toEqual([
      "info",
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
      "info",
    ]);
  });

  it("only the source line right under a File line joins the trace", () => {
    const lines = ["Traceback (most recent call last):", '  File "a.py", line 1', "    x()", "    other()"];
    // The source line right under File is part of the trace; a second indented line is not.
    expect(lineLevels(lines)).toEqual(["error", "error", "error", "info"]);
  });

  it("keeps Java traces together, including '... n more'", () => {
    const lines = [
      "Exception in thread main",
      "\tat com.acme.App.run(App.java:10)",
      "Caused by: java.io.IOException: disk full",
      "\t... 3 more",
      "ok",
    ];
    expect(lineLevels(lines)).toEqual(["error", "error", "error", "error", "info"]);
  });

  it("a warning ends a block and never starts one", () => {
    const lines = ["Error: boom", "warn: retrying", "    at async Promise.all"];
    expect(lineLevels(lines)).toEqual(["error", "warn", "info"]);
  });

  it("gives the same answer as lineLevel for lines with no trace", () => {
    const lines = ["a", "[warn] b", "[ERROR] c", "d"];
    expect(lineLevels(lines)).toEqual(lines.map(lineLevel));
  });

  it("is empty for no lines", () => {
    expect(lineLevels([])).toEqual([]);
  });
});

describe("download", () => {
  it("joins lines with a trailing newline, and is empty for no lines", () => {
    expect(logFileText(["a", "b"])).toBe("a\nb\n");
    expect(logFileText([])).toBe("");
  });

  it("builds a safe file name", () => {
    const now = new Date("2026-11-05T09:00:00Z");
    expect(logFileName("Recipe API!", "24h", now)).toBe("recipe-api-logs-24h-2026-11-05.txt");
    expect(logFileName("../..", "7d", now)).toBe("project-logs-7d-2026-11-05.txt");
  });
});
