/**
 * Unit tests for GET /api/cron/expire-intents.
 *
 * Auth: Bearer CRON_SECRET. Counts expired Intents and hard-deletes those past
 * the retention cutoff (default 90 days). Prisma + sentry mocks come from
 * src/__tests__/setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/cron/expire-intents/route';

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaIntent = prisma.intent as unknown as {
  count: MockFn;
  deleteMany: MockFn;
};

const SECRET = 'test-cron-secret';
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockPrismaIntent.count.mockResolvedValue(0);
  mockPrismaIntent.deleteMany.mockResolvedValue({ count: 0 });
});

afterAll(() => {
  if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  else delete process.env.CRON_SECRET;
});

const makeReq = (opts: { secret?: string | null; query?: string } = {}): Request => {
  const { secret = SECRET, query = '' } = opts;
  const headers: Record<string, string> = {};
  if (secret !== null) headers['authorization'] = `Bearer ${secret}`;
  return new Request(`http://localhost/api/cron/expire-intents${query}`, {
    method: 'GET',
    headers,
  });
};

describe('GET /api/cron/expire-intents', () => {
  it('500 when CRON_SECRET env var is missing', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(500);
  });

  it('401 when bearer token does not match', async () => {
    const res = await GET(makeReq({ secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('401 when authorization header is absent', async () => {
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(401);
  });

  it('200 returns expired + deleted counts using default retention', async () => {
    mockPrismaIntent.count.mockResolvedValueOnce(7);
    mockPrismaIntent.deleteMany.mockResolvedValueOnce({ count: 3 });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      expiredCount: 7,
      deletedCount: 3,
      retentionDays: 90,
    });

    // count() filter is `expiresAt < now`
    const countWhere = mockPrismaIntent.count.mock.calls[0][0].where;
    expect(countWhere.expiresAt.lt).toBeInstanceOf(Date);

    // deleteMany filter cutoff is now - 90 days (within 5s drift)
    const deleteWhere = mockPrismaIntent.deleteMany.mock.calls[0][0].where;
    const cutoff = deleteWhere.expiresAt.lt as Date;
    const expectedCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });

  it('200 honors retentionDays query param', async () => {
    const res = await GET(makeReq({ query: '?retentionDays=30' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retentionDays).toBe(30);

    const deleteWhere = mockPrismaIntent.deleteMany.mock.calls[0][0].where;
    const cutoff = deleteWhere.expiresAt.lt as Date;
    const expectedCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });

  it('500 when prisma throws', async () => {
    mockPrismaIntent.count.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
