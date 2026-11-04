// An intentionally process-local limiter for one synthetic loopback demo.
// It is NOT distributed, identity-aware, or sufficient for public deployment.
export function createDemoRateLimiter({
  now = Date.now, windowMs = 60_000, maxReads = 360, maxWrites = 60
} = {}) {
  if (typeof now !== 'function' || [windowMs, maxReads, maxWrites].some(
    n => !Number.isSafeInteger(n) || n < 1
  )) throw new TypeError('INVALID_LOCAL_RATE_POLICY');
  const buckets = {
    read: { start: null, count: 0, max: maxReads },
    write: { start: null, count: 0, max: maxWrites },
  };
  return function check(method) {
    // All local clients share the same budget: ignore spoofed X-Forwarded-For.
    const bucket = method === 'GET' || method === 'HEAD' ?
      buckets.read : buckets.write;
    const time = now();
    if (!Number.isFinite(time)) throw new TypeError('INVALID_LOCAL_CLOCK');
    if (bucket.start === null || time < bucket.start ||
        time - bucket.start >= windowMs) {
      bucket.start = time;
      bucket.count = 0;
    }
    if (bucket.count >= bucket.max) {
      return { allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(
          (windowMs - (time - bucket.start)) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true };
  };
}
