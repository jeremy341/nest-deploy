import { HttpError } from "@/server/http";

/**
 * A small in-process sliding-window limiter, a safeguard against runaway
 * clients and abuse of the container features. It is per process (like the
 * terminal sessions) and forgets everything on restart.
 *
 * Memory is bounded twice: a key keeps at most `limit` timestamps, and the
 * table holds at most `maxKeys` keys. When it is full, expired keys go first,
 * then the oldest-inserted key (which at worst gives that one key a fresh window).
 */

export type RateResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Record one request for `key` if it fits in `limit` per `windowMs`. */
  check(key: string, limit: number, windowMs: number): RateResult {
    const now = this.now();
    const cutoff = now - windowMs;
    const stamps = this.hits.get(key)?.filter((t) => t > cutoff) ?? [];

    if (stamps.length >= limit) {
      // Refresh so the oldest-inserted eviction order follows recent use.
      this.hits.delete(key);
      this.hits.set(key, stamps);
      const wait = stamps[0] + windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) };
    }

    stamps.push(now);
    this.hits.delete(key);
    if (this.hits.size >= this.maxKeys) this.makeRoom(cutoff);
    this.hits.set(key, stamps);
    return { allowed: true };
  }

  get size(): number {
    return this.hits.size;
  }

  clear(): void {
    this.hits.clear();
  }

  private makeRoom(cutoff: number) {
    for (const [k, stamps] of this.hits) {
      if (stamps[stamps.length - 1] <= cutoff) this.hits.delete(k);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) break;
      this.hits.delete(oldest.value);
    }
  }
}

/** The limits for the container features. Per user, per minute. */
export const RATE_LIMITS = {
  terminalInput: { limit: 300, windowMs: 60_000, what: "terminal input" },
  fileWrite: { limit: 60, windowMs: 60_000, what: "file changes" },
  orphanRemoval: { limit: 10, windowMs: 60_000, what: "leftover removals" },
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

const KEY = Symbol.for("nest-deploy.rate-limiter");

/** One limiter per process, shared by separately bundled route modules. */
export function rateLimiter(): SlidingWindowLimiter {
  const g = globalThis as unknown as Record<symbol, SlidingWindowLimiter | undefined>;
  return (g[KEY] ??= new SlidingWindowLimiter());
}

/** Count one request for this user in this bucket, or throw 429 with a Retry-After header. */
export function enforceRateLimit(bucket: RateBucket, userId: string): void {
  const { limit, windowMs, what } = RATE_LIMITS[bucket];
  const result = rateLimiter().check(`${bucket}:${userId}`, limit, windowMs);
  if (result.allowed) return;
  const seconds = result.retryAfterSeconds;
  throw new HttpError(
    429,
    `Too many requests for ${what}. Wait ${seconds} second${seconds === 1 ? "" : "s"} and try again.`,
    "rate_limited",
    { "Retry-After": String(seconds) }
  );
}
