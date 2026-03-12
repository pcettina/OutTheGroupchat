/**
 * Unit tests for src/lib/rate-limit.ts
 *
 * Strategy
 * --------
 * rate-limit.ts uses @upstash/ratelimit and @upstash/redis.  The module
 * exports three rate-limiter instances (or null) depending on whether the
 * Redis env vars are present at load time.
 *
 * We test two scenarios:
 *
 * 1. Redis NOT configured (env vars absent)
 *    - All three limiter exports are null.
 *    - checkRateLimit always returns { success: true, limit: 0, ... }.
 *
 * 2. Redis IS configured (env vars present)
 *    - We mock @upstash/ratelimit so Ratelimit.limit() can be controlled
 *      per test.
 *    - We verify allow / block / error-fallback behaviour.
 *
 * Because the limiters are initialised at module scope, each sub-group
 * re-imports the module after resetting the module registry.
 *
 * getRateLimitHeaders is a pure utility tested without any mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Top-level mock declarations.  These must appear before any import that
// pulls in the mocked packages.  We use function constructors so that
// `new Ratelimit(...)` and `new Redis(...)` work inside the module under test.
// ---------------------------------------------------------------------------
const mockLimit = vi.fn();

// Ratelimit is used both as a constructor (`new Ratelimit(...)`) and as a
// namespace for static methods (`Ratelimit.slidingWindow(...)`).
// We model this with a named function that also carries the static.
function MockRatelimit(this: unknown) {
  (this as Record<string, unknown>).limit = mockLimit;
}
MockRatelimit.slidingWindow = vi.fn().mockReturnValue({ type: 'slidingWindow' });

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

vi.mock('@upstash/redis', () => ({
  Redis: function () {
    return {};
  },
}));

// ---------------------------------------------------------------------------
// Helper: reload the module under test with specific env vars.
// vi.resetModules() clears the module cache so the next import re-executes
// the module initialisation code.
// ---------------------------------------------------------------------------
async function importRateLimit(env: Record<string, string | undefined> = {}) {
  // Apply env overrides
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key]!;
    }
  }

  vi.resetModules();
  const mod = await import('@/lib/rate-limit');

  // Restore env
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }

  return mod;
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

// ===========================================================================
// Module-level limiter exports — null when Redis is not configured
// ===========================================================================
describe('rate limiter exports when Redis is not configured', () => {
  it('aiRateLimiter is null when env vars are absent', async () => {
    const { aiRateLimiter } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    expect(aiRateLimiter).toBeNull();
  });

  it('apiRateLimiter is null when env vars are absent', async () => {
    const { apiRateLimiter } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    expect(apiRateLimiter).toBeNull();
  });

  it('authRateLimiter is null when env vars are absent', async () => {
    const { authRateLimiter } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    expect(authRateLimiter).toBeNull();
  });
});

// ===========================================================================
// checkRateLimit — Redis NOT configured (null limiter fallback)
// ===========================================================================
describe('checkRateLimit — Redis not configured (null limiter)', () => {
  it('returns success: true when the limiter is null', async () => {
    const { checkRateLimit } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    const result = await checkRateLimit(null, 'user-123');

    expect(result.success).toBe(true);
  });

  it('returns limit: 0, remaining: 0, reset: 0 in the fallback', async () => {
    const { checkRateLimit } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    const result = await checkRateLimit(null, 'user-123');

    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBe(0);
  });

  it('does not call limit() when the limiter is null', async () => {
    const { checkRateLimit } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    await checkRateLimit(null, 'user-abc');

    expect(mockLimit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// checkRateLimit — Redis IS configured (mocked Ratelimit)
// ===========================================================================
describe('checkRateLimit — Redis configured (mocked limiter)', () => {
  const REDIS_ENV = {
    UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
    UPSTASH_REDIS_REST_TOKEN: 'token-abc',
  };

  it('returns success: true and correct counts when the request is allowed', async () => {
    mockLimit.mockResolvedValueOnce({
      success: true,
      limit: 20,
      remaining: 19,
      reset: 1_000_000,
    });

    const { checkRateLimit, aiRateLimiter } = await importRateLimit(REDIS_ENV);

    const result = await checkRateLimit(aiRateLimiter, 'user-123');

    expect(result.success).toBe(true);
    expect(result.limit).toBe(20);
    expect(result.remaining).toBe(19);
  });

  it('returns success: false and remaining: 0 when the request is blocked', async () => {
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 9_999_999,
    });

    const { checkRateLimit, aiRateLimiter } = await importRateLimit(REDIS_ENV);

    const result = await checkRateLimit(aiRateLimiter, 'user-456');

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('calls limiter.limit() with the provided identifier string', async () => {
    mockLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });

    const { checkRateLimit, apiRateLimiter } = await importRateLimit(REDIS_ENV);

    await checkRateLimit(apiRateLimiter, 'ip:192.168.1.1');

    expect(mockLimit).toHaveBeenCalledWith('ip:192.168.1.1');
  });

  it('returns success: true (fail-open) when limiter.limit() throws', async () => {
    mockLimit.mockRejectedValueOnce(new Error('Redis connection failed'));

    const { checkRateLimit, apiRateLimiter } = await importRateLimit(REDIS_ENV);

    const result = await checkRateLimit(apiRateLimiter, 'user-789');

    expect(result.success).toBe(true);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
  });
});

// ===========================================================================
// getRateLimitHeaders — pure utility, no mocking needed
// ===========================================================================
describe('getRateLimitHeaders', () => {
  it('returns the three standard rate-limit headers as strings', async () => {
    const { getRateLimitHeaders } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    const headers = getRateLimitHeaders({ limit: 100, remaining: 42, reset: 1_700_000_000 });

    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Remaining']).toBe('42');
    expect(headers['X-RateLimit-Reset']).toBe('1700000000');
  });

  it('all returned header values are strings (not numbers)', async () => {
    const { getRateLimitHeaders } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    const headers = getRateLimitHeaders({ limit: 5, remaining: 0, reset: 0 });

    for (const value of Object.values(headers)) {
      expect(typeof value).toBe('string');
    }
  });

  it('returns exactly 3 header keys', async () => {
    const { getRateLimitHeaders } = await importRateLimit({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    const headers = getRateLimitHeaders({ limit: 20, remaining: 10, reset: 12345 });

    expect(Object.keys(headers)).toHaveLength(3);
  });
});
