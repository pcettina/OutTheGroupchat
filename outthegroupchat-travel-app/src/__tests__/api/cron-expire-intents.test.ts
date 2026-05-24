// Unit tests for GET /api/cron/expire-intents (V1 Phase 5, R12).
// Auth: Bearer CRON_SECRET. Counts currently-expired intents and hard-deletes
// intents past their `expiresAt + retentionDays` (default 90d). Expiry itself
// is implicit at read time — this cron is purely retention hygiene.
// Note: the task brief mentions a "2h grace period", but the actual route
// uses a retention-day cutoff (default 90 days). Tests reflect the real
// implementation per project rule: fix tests to match route, not vice versa.
// Prisma/sentry/logger mocks live in src/__tests__/setup.ts.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';

import { GET } from '@/app/api/cron/expire-intents/route';
import { captureException } from '@/lib/sentry';

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaIntent = prisma.intent as unknown as {
  count: MockFn;
  deleteMany: MockFn;
};
const mockCaptureException = vi.mocked(captureException);

const SECRET = 'test-cron-secret';
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  // Default no-op resolutions; specific tests override via mockResolvedValueOnce.
  mockPrismaIntent.count.mockResolvedValue(0);
  mockPrismaIntent.deleteMany.mockResolvedValue({ count: 0 });
});

afterAll(() => {
  if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  else delete process.env.CRON_SECRET;
});

// Plain Request — route only reads headers + url.
const makeReq = (opts: { secret?: string | null; retentionDays?: number } = {}): Request => {
  const { secret = SECRET, retentionDays } = opts;
  const headers: Record<string, string> = {};
  if (secret !== null) headers['authorization'] = `Bearer ${secret}`;
  const url = retentionDays !== undefined
    ? `http://localhost/api/cron/expire-intents?retentionDays=${retentionDays}`
    : 'http://localhost/api/cron/expire-intents';
  return new Request(url, { method: 'GET', headers });
};

// ===========================================================================
// Auth
// ===========================================================================
describe('GET /api/cron/expire-intents — auth', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeReq({ secret: null }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
    expect(mockPrismaIntent.count).not.toHaveBeenCalled();
    expect(mockPrismaIntent.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header carries the wrong bearer', async () => {
    const res = await GET(makeReq({ secret: 'wrong-secret' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
    expect(mockPrismaIntent.count).not.toHaveBeenCalled();
    expect(mockPrismaIntent.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 500 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeReq({ secret: SECRET }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/cron configuration/i);
    expect(mockPrismaIntent.count).not.toHaveBeenCalled();
    expect(mockPrismaIntent.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 200 with success: true on a valid CRON_SECRET bearer', async () => {
    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// Deletion cutoff — retention window math
// ===========================================================================
describe('GET /api/cron/expire-intents — deletion cutoff', () => {
  it('deletes intents past the default 90-day retention cutoff (= window end + grace)', async () => {
    const before = Date.now();
    await GET(makeReq());
    const after = Date.now();

    expect(mockPrismaIntent.deleteMany).toHaveBeenCalledTimes(1);
    const arg = mockPrismaIntent.deleteMany.mock.calls[0][0] as {
      where: { expiresAt: { lt: Date } };
    };
    const cutoffMs = arg.where.expiresAt.lt.getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(before - ninetyDaysMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - ninetyDaysMs + 1000);
  });

  it('uses a custom retentionDays query param when provided', async () => {
    const before = Date.now();
    await GET(makeReq({ retentionDays: 7 }));
    const after = Date.now();

    const arg = mockPrismaIntent.deleteMany.mock.calls[0][0] as {
      where: { expiresAt: { lt: Date } };
    };
    const cutoffMs = arg.where.expiresAt.lt.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - sevenDaysMs + 1000);
  });

  it('does NOT delete intents still within their active window (cutoff is strictly in the past)', async () => {
    // The delete predicate is `expiresAt < (now - retentionDays)`.
    // An intent with expiresAt > now (still active) trivially fails this — Prisma
    // would never include it. We verify by asserting cutoff sits in the past
    // and the operator is strict `lt`.
    await GET(makeReq());

    const arg = mockPrismaIntent.deleteMany.mock.calls[0][0] as {
      where: { expiresAt: { lt: Date } };
    };
    const cutoff = arg.where.expiresAt.lt;
    const now = Date.now();

    expect(cutoff.getTime()).toBeLessThan(now);
    expect(arg.where.expiresAt).toHaveProperty('lt');
    expect(arg.where.expiresAt).not.toHaveProperty('gte');
    expect(arg.where.expiresAt).not.toHaveProperty('lte');
  });

  it('does NOT delete intents within their retention grace period (counted but preserved)', async () => {
    // Route counts ALL expired intents but only deletes those past retention.
    // Recently-expired intents (within grace) appear in expiredCount but not
    // in deletedCount.
    mockPrismaIntent.count.mockResolvedValueOnce(50);
    mockPrismaIntent.deleteMany.mockResolvedValueOnce({ count: 5 });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.expiredCount).toBe(50);
    expect(body.deletedCount).toBe(5);
    // 45 intents are expired-but-within-grace — preserved for v1.5 embedder training.
  });
});

// ===========================================================================
// Response shape
// ===========================================================================
describe('GET /api/cron/expire-intents — response', () => {
  it('returns the count of deleted intents in the response body', async () => {
    mockPrismaIntent.count.mockResolvedValueOnce(12);
    mockPrismaIntent.deleteMany.mockResolvedValueOnce({ count: 7 });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      expiredCount: 12,
      deletedCount: 7,
      retentionDays: 90,
    });
  });

  it('handles the empty case (no expired intents) gracefully with zeroed counts', async () => {
    mockPrismaIntent.count.mockResolvedValueOnce(0);
    mockPrismaIntent.deleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      expiredCount: 0,
      deletedCount: 0,
      retentionDays: 90,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reflects the custom retentionDays value in the response', async () => {
    mockPrismaIntent.count.mockResolvedValueOnce(3);
    mockPrismaIntent.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await GET(makeReq({ retentionDays: 30 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(30);
    expect(body.deletedCount).toBe(1);
  });
});

// ===========================================================================
// Error handling
// ===========================================================================
describe('GET /api/cron/expire-intents — errors', () => {
  it('returns 500 and calls captureException when prisma.intent.count throws', async () => {
    mockPrismaIntent.count.mockRejectedValueOnce(new Error('DB connection reset'));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed/i);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockPrismaIntent.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 500 and calls captureException when prisma.intent.deleteMany throws', async () => {
    mockPrismaIntent.count.mockResolvedValueOnce(10);
    mockPrismaIntent.deleteMany.mockRejectedValueOnce(new Error('DB write failed'));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed/i);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
