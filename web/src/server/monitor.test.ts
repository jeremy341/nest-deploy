import { describe, expect, it } from "vitest";
import { describeAction } from "@/server/audit";
import { FAILURES_BEFORE_DOWN, isHealthy, nextMonitorState } from "@/server/monitor";
import { parseServiceStatus } from "@/server/service-status";

const status = (lines: string[]) => parseServiceStatus(lines.join("\n"));
const base = ["ND_LoadState=loaded", "ND_ActiveState=active", "ND_SubState=running"];

describe("isHealthy", () => {
  it("needs a running service that answers", () => {
    expect(isHealthy(status([...base, "ND_HTTP=200 0.01"]))).toBe(true);
    expect(isHealthy(status([...base, "ND_HTTP=404 0.01"]))).toBe(true);
  });

  it("fails on server errors and silence", () => {
    expect(isHealthy(status([...base, "ND_HTTP=502 0.01"]))).toBe(false);
    expect(isHealthy(status([...base, "ND_HTTP=000 0.00"]))).toBe(false);
  });

  it("fails when the service is not running, however the port answers", () => {
    expect(isHealthy(status(["ND_LoadState=loaded", "ND_ActiveState=failed", "ND_HTTP=200 0.01"]))).toBe(false);
  });

  it("trusts systemd when curl is missing", () => {
    expect(isHealthy(status(base))).toBe(true);
  });
});

describe("nextMonitorState", () => {
  it("does not alert on a single failed check", () => {
    const t = nextMonitorState({ state: "up", failures: 0 }, false);
    expect(t).toEqual({ state: "up", failures: 1, change: null });
  });

  it("alerts once when failures reach the limit, then stays quiet", () => {
    let s = { state: "up" as const, failures: 0 } as { state: "up" | "down" | "unknown"; failures: number };
    const changes: (string | null)[] = [];
    for (let i = 0; i < FAILURES_BEFORE_DOWN + 2; i++) {
      const t = nextMonitorState(s, false);
      changes.push(t.change);
      s = t;
    }
    expect(changes.filter((c) => c === "down")).toHaveLength(1);
    expect(s.state).toBe("down");
  });

  it("announces recovery only after an outage", () => {
    expect(nextMonitorState({ state: "down", failures: 5 }, true)).toEqual({
      state: "up",
      failures: 0,
      change: "up",
    });
    expect(nextMonitorState({ state: "unknown", failures: 0 }, true).change).toBeNull();
    expect(nextMonitorState({ state: "up", failures: 1 }, true).failures).toBe(0);
  });

  it("an app that was never up can still be reported down", () => {
    const first = nextMonitorState({ state: "unknown", failures: 0 }, false);
    const second = nextMonitorState(first, false);
    expect(second.change).toBe("down");
  });
});

describe("describeAction", () => {
  it("has words for known actions and falls back to the raw name", () => {
    expect(describeAction("project.restart")).toBe("Restarted");
    expect(describeAction("something.new")).toBe("something.new");
  });
});
