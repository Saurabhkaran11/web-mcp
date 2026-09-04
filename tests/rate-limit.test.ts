import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "../app/lib/rate-limit";

test("allows requests until the configured limit is reached", () => {
  const limiter = createRateLimiter();

  assert.deepEqual(limiter.check("catalog:127.0.0.1", { limit: 2, windowMs: 1_000, now: 100 }), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
  });
  assert.equal(limiter.check("catalog:127.0.0.1", { limit: 2, windowMs: 1_000, now: 200 }).allowed, true);

  const blocked = limiter.check("catalog:127.0.0.1", { limit: 2, windowMs: 1_000, now: 300 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("creates a fresh limit window after expiry", () => {
  const limiter = createRateLimiter();
  limiter.check("cart:127.0.0.1", { limit: 1, windowMs: 1_000, now: 100 });

  const afterExpiry = limiter.check("cart:127.0.0.1", {
    limit: 1,
    windowMs: 1_000,
    now: 1_100,
  });
  assert.equal(afterExpiry.allowed, true);
  assert.equal(afterExpiry.remaining, 0);
});
