import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRateLimiter } from '../src/demo_rate_limit.mjs';

test('local fixed-window buckets throttle writes separately from GET/HEAD', () => {
  let tick = 1000;
  const limit = createDemoRateLimiter({
    now: () => tick, windowMs: 5000, maxReads: 2, maxWrites: 1
  });
  assert.deepEqual(limit('POST'), { allowed: true });
  assert.deepEqual(limit('GET'), { allowed: true });
  assert.deepEqual(limit('HEAD'), { allowed: true });
  assert.deepEqual(limit('POST'), { allowed: false, retryAfterSeconds: 5 });
  assert.deepEqual(limit('GET'), { allowed: false, retryAfterSeconds: 5 });
  tick += 4500;
  assert.deepEqual(limit('POST'), { allowed: false, retryAfterSeconds: 1 });
  tick += 500;
  assert.deepEqual(limit('POST'), { allowed: true });
  assert.deepEqual(limit('GET'), { allowed: true });
});

test('limiter rejects invalid policies and rewound/non-finite time', () => {
  assert.throws(() => createDemoRateLimiter({maxWrites: 0}), /INVALID_LOCAL_RATE_POLICY/);
  assert.throws(() => createDemoRateLimiter({windowMs: Infinity}), /INVALID_LOCAL_RATE_POLICY/);
  assert.throws(() => createDemoRateLimiter({now: null}), /INVALID_LOCAL_RATE_POLICY/);
  let tick = 2000;
  const limit = createDemoRateLimiter({now: () => tick, maxWrites: 1});
  assert.equal(limit('POST').allowed, true);
  tick = 1000;
  assert.equal(limit('POST').allowed, true);
  tick = NaN;
  assert.throws(() => limit('POST'), /INVALID_LOCAL_CLOCK/);
});

test('many page reloads with ten scripts remain bounded, while mutation budget stays separate', () => {
  let time = 10_000;
  const limit = createDemoRateLimiter({now: () => time});
  // One browser page navigation fetches an HTML document and ten local JS
  // assets. CI uses one long-lived demo process for desktop + mobile journeys.
  for (let reload = 0; reload < 64; reload++) {
    for (let request = 0; request < 11; request++) {
      assert.equal(limit('GET').allowed, true, 'reload ' + reload);
    }
  }
  for (let request = 0; request < 16; request++) {
    assert.equal(limit('GET').allowed, true);
  }
  assert.deepEqual(limit('GET'), {allowed:false,retryAfterSeconds:60});
  for (let request = 0; request < 60; request++) {
    assert.equal(limit('POST').allowed, true);
  }
  assert.deepEqual(limit('POST'), {allowed:false,retryAfterSeconds:60});
  time += 60_000;
  assert.equal(limit('GET').allowed, true);
  assert.equal(limit('POST').allowed, true);
});
