import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOG_RANGE,
  filterByLevel,
  journalSince,
  lineLevel,
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
