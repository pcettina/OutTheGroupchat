/**
 * Unit tests for GET /api/topics — the lightweight Topic list used by the
 * Intent create form's manual-picker fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Rate-limit pass-through mock (the route rate-limits the topics list per user).
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from '@/app/api/topics/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaTopic = prisma.topic as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish the permanent rate-limit pass-through after reset (resetAllMocks
  // clears the factory-level mockResolvedValue).
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

describe('GET /api/topics', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('200 returns ordered topic list (id/slug/displayName only)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
      { id: 't2', slug: 'drinks', displayName: 'Drinks' },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toHaveLength(2);

    const select = mockPrismaTopic.findMany.mock.calls[0][0].select;
    expect(select).toEqual({ id: true, slug: true, displayName: true });
    const orderBy = mockPrismaTopic.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ displayName: 'asc' });
  });

  it('500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('429 when the per-user rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });

    const res = await GET();
    expect(res.status).toBe(429);
    // Topic query must not run once rate-limited.
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
  });
});
