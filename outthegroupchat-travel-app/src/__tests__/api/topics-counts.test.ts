/**
 * Unit tests for the `?withCounts=true` decoration on GET /api/topics (Day 9).
 *
 * The counts are OPT-IN and FAIL-SOFT: this endpoint gates signup/onboarding and
 * the Intent create form, so a broken aggregate must degrade to `count: 0`
 * rather than 500. The no-param payload must stay byte-identical to what the
 * existing consumers already receive.
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
const mockPrismaIntent = prisma.intent as unknown as { groupBy: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

const TOPICS = [
  { id: 't1', slug: 'brunch', displayName: 'Brunch' },
  { id: 't2', slug: 'drinks', displayName: 'Drinks' },
  { id: 't3', slug: 'hiking', displayName: 'Hiking' },
];

const req = (query = '') => new Request(`http://localhost/api/topics${query}`);

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

describe('GET /api/topics?withCounts=true', () => {
  it('merges live Intent counts onto each topic', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);
    mockPrismaIntent.groupBy.mockResolvedValueOnce([
      { topicId: 't2', _count: { _all: 5 } },
      { topicId: 't1', _count: { _all: 2 } },
    ]);

    const res = await GET(req('?withCounts=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Server order (findMany orderBy) is preserved; counts folded on.
    expect(body.data.topics).toEqual([
      { id: 't1', slug: 'brunch', displayName: 'Brunch', count: 2 },
      { id: 't2', slug: 'drinks', displayName: 'Drinks', count: 5 },
      // t3 has no groupBy row at all -> defaults to 0 rather than being dropped.
      { id: 't3', slug: 'hiking', displayName: 'Hiking', count: 0 },
    ]);
  });

  it('aggregates by topicId over non-expired Intents only', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);
    mockPrismaIntent.groupBy.mockResolvedValueOnce([]);

    const before = Date.now();
    const res = await GET(req('?withCounts=true'));
    const after = Date.now();
    expect(res.status).toBe(200);

    expect(mockPrismaIntent.groupBy).toHaveBeenCalledTimes(1);
    const args = mockPrismaIntent.groupBy.mock.calls[0][0];
    expect(args.by).toEqual(['topicId']);
    expect(args._count).toEqual({ _all: true });

    const gt = args.where.expiresAt.gt;
    expect(gt).toBeInstanceOf(Date);
    // "Live" is evaluated against now, not a hard-coded or stale timestamp.
    expect(gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(gt.getTime()).toBeLessThanOrEqual(after);

    // Every topic still comes back, at zero.
    const body = await res.json();
    expect(body.data.topics.map((t: { count: number }) => t.count)).toEqual([0, 0, 0]);
  });

  it('ignores groupBy rows for unknown topicIds', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([TOPICS[0]]);
    mockPrismaIntent.groupBy.mockResolvedValueOnce([
      { topicId: 't1', _count: { _all: 3 } },
      { topicId: 'deleted-topic', _count: { _all: 99 } },
    ]);

    const res = await GET(req('?withCounts=true'));
    const body = await res.json();
    expect(body.data.topics).toEqual([
      { id: 't1', slug: 'brunch', displayName: 'Brunch', count: 3 },
    ]);
  });

  it('fails soft to count: 0 when the aggregate throws (no 500)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);
    mockPrismaIntent.groupBy.mockRejectedValueOnce(new Error('aggregate exploded'));

    const res = await GET(req('?withCounts=true'));
    // The Topic list gates signup/onboarding — a counts regression must not 500.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toEqual([
      { id: 't1', slug: 'brunch', displayName: 'Brunch', count: 0 },
      { id: 't2', slug: 'drinks', displayName: 'Drinks', count: 0 },
      { id: 't3', slug: 'hiking', displayName: 'Hiking', count: 0 },
    ]);
  });
});

describe('GET /api/topics — counts stay opt-in', () => {
  it('bare GET() does not query counts and omits `count`', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
    expect(body.data.topics).toEqual(TOPICS);
    expect(body.data.topics[0]).not.toHaveProperty('count');
  });

  it('a Request without the param does not query counts', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
    expect(body.data.topics).toEqual(TOPICS);
  });

  it('?withCounts=false behaves as no-counts', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);

    const res = await GET(req('?withCounts=false'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
    expect(body.data.topics).toEqual(TOPICS);
  });

  it('an unrecognised ?withCounts value degrades to no-counts (not a 400)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);

    const res = await GET(req('?withCounts=banana'));
    // Deliberately permissive: an unknown value must not break the list.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
    expect(body.data.topics).toEqual(TOPICS);
  });

  it('unrelated query params are ignored', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce(TOPICS);

    const res = await GET(req('?foo=bar&limit=3'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
    expect(body.data.topics).toEqual(TOPICS);
  });
});

describe('GET /api/topics?withCounts=true — guards still apply', () => {
  it('401 when unauthenticated, before any query runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(req('?withCounts=true'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
  });

  it('429 when rate-limited, before any query runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });

    const res = await GET(req('?withCounts=true'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Rate limit exceeded' });
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
    expect(mockPrismaIntent.groupBy).not.toHaveBeenCalled();
  });

  it('500 when the topic list itself fails, even with counts requested', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(req('?withCounts=true'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to list topics' });
  });
});
