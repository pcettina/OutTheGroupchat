/**
 * Extended edge-case tests for GET /api/intents/crew (R2 — Crew tier).
 *
 * These tests complement intents.test.ts by exercising:
 *   - Rate limiting (429)
 *   - Zod validation on query params (topicId cuid, limit bounds)
 *   - Prisma error path (500)
 *   - Visibility filtering (state INTERESTED only, expiresAt > now)
 *   - Topic narrowing
 *   - Limit propagation to take
 *   - Crew expansion when caller is on either side (userAId / userBId)
 *   - Empty result after Crew lookup yields []
 *   - Ordering by createdAt desc passed to prisma
 *   - Default limit fallback (50)
 *   - Caller never appears in crewIds.in clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as GET_CREW } from '@/app/api/intents/crew/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockPrismaIntent = prisma.intent as unknown as {
  findMany: MockFn;
};
const mockPrismaCrew = prisma.crew as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: `${id}@example.com` },
  expires: '2099-01-01',
});

const TOPIC_DRINKS_ID = 'cltopic1234567890drinks0';

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-2',
  topicId: TOPIC_DRINKS_ID,
  windowPreset: 'EVENING',
  startAt: null,
  endAt: null,
  dayOffset: 0,
  state: 'INTERESTED',
  cityArea: null,
  venueId: null,
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  createdAt: new Date(),
  user: { id: 'user-2', name: 'Bob', image: null },
  topic: { id: TOPIC_DRINKS_ID, slug: 'drinks', displayName: 'Drinks' },
  ...over,
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

describe('GET /api/intents/crew — extended edge cases', () => {
  it('401 when session has no user.id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'X', email: 'x@example.com' },
      expires: '2099-01-01',
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('429 when rate-limited; never touches the database', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('400 when topicId is not a CUID', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: 'not-a-cuid' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
    expect(body.details).toBeTruthy();
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 when limit is below 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(makeGetReq('/api/intents/crew', { limit: '0' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit exceeds 100', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { limit: '101' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when limit is non-numeric', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { limit: 'abc' }),
    );
    expect(res.status).toBe(400);
  });

  it('uses default limit of 50 when no limit query param is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
  });

  it('respects an explicit limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { limit: '7' }),
    );
    expect(res.status).toBe(200);

    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.take).toBe(7);
  });

  it('narrows by topicId when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ topicId: TOPIC_DRINKS_ID }),
    ]);

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: TOPIC_DRINKS_ID }),
    );
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.topicId).toBe(TOPIC_DRINKS_ID);
  });

  it('omits topicId from the where clause when not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.topicId).toBeUndefined();
  });

  it('filters to state=INTERESTED (excludes COMMITTED) and expiresAt > now', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.state).toBe('INTERESTED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    // expiresAt cutoff should be ~now
    const drift = Math.abs(
      (where.expiresAt.gt as Date).getTime() - Date.now(),
    );
    expect(drift).toBeLessThan(5000);
  });

  it('orders results by createdAt desc (most recent first)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('queries Crew where status=ACCEPTED and OR userAId/userBId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('caller-007'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const crewArgs = mockPrismaCrew.findMany.mock.calls[0][0];
    expect(crewArgs.where.status).toBe('ACCEPTED');
    expect(crewArgs.where.OR).toEqual([
      { userAId: 'caller-007' },
      { userBId: 'caller-007' },
    ]);
  });

  it('expands crewIds to the OTHER side when caller is userAId or userBId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' }, // caller is A → peer is user-2
      { userAId: 'user-3', userBId: 'user-1' }, // caller is B → peer is user-3
      { userAId: 'user-1', userBId: 'user-4' }, // caller is A → peer is user-4
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(['user-2', 'user-3', 'user-4']);
    // Caller must never appear in the in-clause
    expect(where.userId.in).not.toContain('user-1');
  });

  it('returns empty intents array (and skips intent query) when no accepted Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.intents).toEqual([]);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when Crew exists but no live intents match', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.intents).toEqual([]);
  });

  it('returns multiple intents preserving the order from prisma (DB is source of truth for ordering)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    const newest = fakeIntent({
      id: 'intent-newest',
      userId: 'user-2',
      createdAt: new Date('2026-05-12T10:00:00Z'),
    });
    const older = fakeIntent({
      id: 'intent-older',
      userId: 'user-3',
      createdAt: new Date('2026-05-12T09:00:00Z'),
    });
    mockPrismaIntent.findMany.mockResolvedValueOnce([newest, older]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.intents.map((i: { id: string }) => i.id)).toEqual([
      'intent-newest',
      'intent-older',
    ]);
  });

  it('500 when prisma.crew.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list crew intents');
  });

  it('500 when prisma.intent.findMany throws after a successful Crew lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockRejectedValueOnce(new Error('query failed'));

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list crew intents');
  });

  it('includes user + topic shape in select for hydration', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.select.user).toEqual({
      select: { id: true, name: true, image: true },
    });
    expect(args.select.topic).toEqual({
      select: { id: true, slug: true, displayName: true },
    });
  });
});
