import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/server/http";
import { RATE_LIMITS, SlidingWindowLimiter, enforceRateLimit, rateLimiter } from "@/server/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit inside the window, then refuses with a wait time", () => {
    const c = clock();
    const l = new SlidingWindowLimiter(100, c.now);
    for (let i = 0; i < 3; i++) expect(l.check("a", 3, 60_000)).toEqual({ allowed: true });
    c.advance(10_000);
    expect(l.check("a", 3, 60_000)).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("slides: room comes back as old requests leave the window", () => {
    const c = clock();
    const l = new SlidingWindowLimiter(100, c.now);
    l.check("a", 2, 60_000); // t=0
    c.advance(30_000);
    l.check("a", 2, 60_000); // t=30s
    c.advance(29_999);
    expect(l.check("a", 2, 60_000).allowed).toBe(false); // t=59.999s, none has left
    c.advance(1); // t=60s: the first one is out
    expect(l.check("a", 2, 60_000).allowed).toBe(true);
    expect(l.check("a", 2, 60_000).allowed).toBe(false);
  });

  it("does not count refused requests against the window", () => {
    const c = clock();
    const l = new SlidingWindowLimiter(100, c.now);
    l.check("a", 1, 1000);
    for (let i = 0; i < 20; i++) l.check("a", 1, 1000);
    c.advance(1000);
    expect(l.check("a", 1, 1000).allowed).toBe(true);
  });

  it("keeps keys apart", () => {
    const l = new SlidingWindowLimiter(100, clock().now);
    expect(l.check("a", 1, 1000).allowed).toBe(true);
    expect(l.check("a", 1, 1000).allowed).toBe(false);
    expect(l.check("b", 1, 1000).allowed).toBe(true);
  });

  it("never holds more keys than the cap, dropping expired keys before live ones", () => {
    const c = clock();
    const l = new SlidingWindowLimiter(3, c.now);
    l.check("old1", 5, 1000);
    l.check("old2", 5, 1000);
    c.advance(2000); // both expired
    l.check("live1", 5, 1000);
    l.check("live2", 5, 1000);
    l.check("live3", 5, 1000); // full: expired keys are swept first
    expect(l.size).toBe(3);
    // The live keys all survived the sweep: a refused repeat proves live1 is still tracked.
    expect(l.check("live1", 1, 1000).allowed).toBe(false);
    l.check("live4", 5, 1000); // nothing expired: the oldest-inserted key goes
    expect(l.size).toBe(3);
    for (let i = 0; i < 1000; i++) l.check(`flood${i}`, 5, 1000);
    expect(l.size).toBe(3);
  });

  it("keeps a refused key in the table without growing it", () => {
    const l = new SlidingWindowLimiter(10, clock().now);
    for (let i = 0; i < 500; i++) l.check("a", 4, 60_000);
    expect(l.size).toBe(1);
  });
});

describe("enforceRateLimit", () => {
  it("uses the documented limits", () => {
    expect(RATE_LIMITS.terminalInput.limit).toBe(300);
    expect(RATE_LIMITS.fileWrite.limit).toBe(60);
    expect(RATE_LIMITS.orphanRemoval.limit).toBe(10);
    for (const r of Object.values(RATE_LIMITS)) expect(r.windowMs).toBe(60_000);
  });

  it("throws a 429 with a Retry-After header after the cap, per user and per bucket", () => {
    rateLimiter().clear();
    for (let i = 0; i < RATE_LIMITS.orphanRemoval.limit; i++) enforceRateLimit("orphanRemoval", "u1");
    let err: unknown;
    try {
      enforceRateLimit("orphanRemoval", "u1");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    const http = err as HttpError;
    expect(http.status).toBe(429);
    expect(http.code).toBe("rate_limited");
    expect(Number(http.headers?.["Retry-After"])).toBeGreaterThanOrEqual(1);
    expect(Number(http.headers?.["Retry-After"])).toBeLessThanOrEqual(60);
    expect(http.message).toMatch(/wait \d+ seconds? and try again/i);
    // Another user, and another bucket for the same user, are unaffected.
    expect(() => enforceRateLimit("orphanRemoval", "u2")).not.toThrow();
    expect(() => enforceRateLimit("fileWrite", "u1")).not.toThrow();
    rateLimiter().clear();
  });

  it("reopens after the window", () => {
    vi.useFakeTimers();
    try {
      rateLimiter().clear();
      for (let i = 0; i < RATE_LIMITS.orphanRemoval.limit; i++) enforceRateLimit("orphanRemoval", "u3");
      expect(() => enforceRateLimit("orphanRemoval", "u3")).toThrow();
      vi.advanceTimersByTime(60_001);
      expect(() => enforceRateLimit("orphanRemoval", "u3")).not.toThrow();
    } finally {
      vi.useRealTimers();
      rateLimiter().clear();
    }
  });
});
