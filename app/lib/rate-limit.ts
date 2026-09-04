type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function createRateLimiter() {
  const buckets = new Map<string, Bucket>();

  function removeExpiredBuckets(now: number) {
    if (buckets.size < 5_000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(key: string, { limit, windowMs, now = Date.now() }: RateLimitOptions): RateLimitResult {
      removeExpiredBuckets(now);
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1_000));
      if (existing.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      existing.count += 1;
      return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
    },
  };
}

export const apiRateLimiter = createRateLimiter();

export function getClientIp(request: Pick<Request, "headers">) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
