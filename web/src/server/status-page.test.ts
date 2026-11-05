import { describe, expect, it } from "vitest";
import { dailyStrip, uptimePercent } from "@/server/status-page";

const DAY = 86_400_000;
const now = new Date(Date.UTC(2026, 10, 5, 12, 0, 0)); // 5 Nov 2026, noon UTC
const at = (iso: string) => new Date(iso);

describe("dailyStrip", () => {
  it("has one entry per UTC day, oldest first, ending with today", () => {
    const days = dailyStrip([], now, 30);
    expect(days).toHaveLength(30);
    expect(days[29].day).toBe("2026-11-05");
    expect(days[0].day).toBe("2026-10-07");
    expect(days.every((d) => d.state === "up")).toBe(true);
  });

  it("marks a day partial when the app was down for part of it", () => {
    const incidents = [{ from: at("2026-11-03T10:00:00Z"), to: at("2026-11-03T11:30:00Z") }];
    const day = dailyStrip(incidents, now, 30).find((d) => d.day === "2026-11-03");
    expect(day).toEqual({ day: "2026-11-03", state: "partial", downMinutes: 90 });
  });

  it("marks a day down when the app was down for more than half of it", () => {
    const incidents = [{ from: at("2026-11-02T00:00:00Z"), to: at("2026-11-02T20:00:00Z") }];
    const day = dailyStrip(incidents, now, 30).find((d) => d.day === "2026-11-02");
    expect(day?.state).toBe("down");
    expect(day?.downMinutes).toBe(1200);
  });

  it("splits an outage across midnight between two days", () => {
    const incidents = [{ from: at("2026-11-03T23:00:00Z"), to: at("2026-11-04T01:00:00Z") }];
    const days = dailyStrip(incidents, now, 30);
    expect(days.find((d) => d.day === "2026-11-03")?.downMinutes).toBe(60);
    expect(days.find((d) => d.day === "2026-11-04")?.downMinutes).toBe(60);
  });

  it("keeps an ongoing outage running up to now", () => {
    const incidents = [{ from: at("2026-11-05T05:00:00Z"), to: null }];
    const today = dailyStrip(incidents, now, 30)[29];
    expect(today.state).toBe("down");
    expect(today.downMinutes).toBe(420);
  });

  it("shows no checks yet for every day when nothing has been checked", () => {
    const days = dailyStrip([], now, 30, false);
    expect(days.every((d) => d.state === "none")).toBe(true);
  });

  it("agrees with the uptime figure over the same window", () => {
    const incidents = [{ from: at("2026-11-03T10:00:00Z"), to: at("2026-11-03T11:30:00Z") }];
    const days = dailyStrip(incidents, now, 30);
    const downMinutes = days.reduce((sum, d) => sum + d.downMinutes, 0);
    const windowMinutes = (now.getTime() - (now.getTime() - 30 * DAY)) / 60_000;
    const fromStrip = 100 - (downMinutes / windowMinutes) * 100;
    const fromUptime = uptimePercent(incidents, new Date(now.getTime() - 30 * DAY), now);
    // The strip starts at the UTC midnight 30 days back, so the window differs by part of a day.
    expect(Math.abs(fromStrip - fromUptime)).toBeLessThan(0.5);
  });
});
