/**
 * Integration tests for V1 Phase 1 Intent sub-routes:
 *   GET /api/intents/mine — list caller's own live Intents
 *   GET /api/intents/crew — list Crew Intents (Phase 8 hot path)
 *
 * Phase 8 launch-readiness re-audit (Action #5): integration coverage on V1
 * hot paths. Mirrors the patterns in src/__tests__/api/intents.test.ts but
 * exercises additional dimensions: state filtering, topicId filtering, limit
 * coercion, Crew membership flipping (userAId vs userBId), 500 error paths
 * with Sentry assertion.
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from
 * src/__tests__/setup.ts. Rate-limit is mocked locally so we can re-arm
 * mockResolvedValue after vi.resetAllMocks() in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/sentry';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as GET_MINE } from '@/app/api/intents/mine/route';
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
const mockCaptureException = vi.mocked(captureException);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const TOPIC_DRINKS_ID = 'cltopic1234567890drinks0';
const TOPIC_COFFEE_ID = 'cltopic1234567890coffee0';

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-1',
  topicId: TOPIC_DRINKS_ID,
  windowPreset: 'EVENING',
  startAt: null,
  endAt: null,
  dayOffset: 0,
  state: 'INTERESTED',
  cityArea: null,
  venueId: null,
  rawText: 'drinks tonight',
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  createdAt: new Date(),
  topic: { id: TOPIC_DRINKS_ID, slug: 'drinks', displayName: 'Drinks' },
  ...over,
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/intents/mine
// ===========================================================================
describe('GET /api/intents/mine', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(429);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('200 returns caller intents, scoped by userId and default expiresAt gt now', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent(),
      fakeIntent({ id: 'cli12345intent000000002' }),
    ]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.intents).toHaveLength(2);

    const call = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
    expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
    // Default limit 50
    expect(call.take).toBe(50);
    // No state filter when none requested
    expect(call.where.state).toBeUndefined();
  });

  it('200 empty list when caller has no live intents', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toEqual([]);
  });

  it('200 with state=COMMITTED filters by state', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ state: 'COMMITTED' }),
    ]);

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { state: 'COMMITTED' }),
    );
    expect(res.status).toBe(200);
    const call = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(call.where.state).toBe('COMMITTED');
  });

  it('200 with includeExpired=true drops the expiresAt filter', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { includeExpired: 'true' }),
    );
    expect(res.status).toBe(200);
    const call = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(call.where.expiresAt).toBeUndefined();
  });

  it('200 respects the limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine', { limit: '10' }));
    expect(res.status).toBe(200);
    expect(mockPrismaIntent.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('400 when limit is out of range', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(makeGetReq('/api/intents/mine', { limit: '500' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('500 captures exception when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockRejectedValueOnce(new Error('db boom'));

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list intents');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// GET /api/intents/crew
// ===========================================================================
describe('GET /api/intents/crew', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(401);
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(429);
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('200 returns Crew intents filtered to INTERESTED + not expired', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ userId: 'user-2' }),
      fakeIntent({ userId: 'user-3', id: 'cli12345intent000000099' }),
    ]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.intents).toHaveLength(2);

    // Crew query must scope to ACCEPTED relationships involving caller
    const crewWhere = mockPrismaCrew.findMany.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    expect(crewWhere.OR).toEqual([
      { userAId: 'user-1' },
      { userBId: 'user-1' },
    ]);

    // Intent query: only crew userIds, INTERESTED only, not expired
    const intentWhere = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(intentWhere.userId.in).toEqual(['user-2', 'user-3']);
    expect(intentWhere.state).toBe('INTERESTED');
    expect(intentWhere.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('200 empty array when caller has no accepted Crew (short-circuits intent query)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toEqual([]);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('200 empty array when crew members have no live INTERESTED intents', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toEqual([]);
    // intent.findMany was called; pure-empty result, not a short-circuit
    expect(mockPrismaIntent.findMany).toHaveBeenCalledTimes(1);
  });

  it('200 with topicId narrows to one Topic', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ userId: 'user-2', topicId: TOPIC_COFFEE_ID }),
    ]);

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: TOPIC_COFFEE_ID }),
    );
    expect(res.status).toBe(200);
    const intentWhere = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(intentWhere.topicId).toBe(TOPIC_COFFEE_ID);
  });

  it('400 when topicId is not a valid cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: 'not-a-cuid' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('200 respects the limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew', { limit: '5' }));
    expect(res.status).toBe(200);
    expect(mockPrismaIntent.findMany.mock.calls[0][0].take).toBe(5);
  });

  it('500 captures exception when prisma throws on crew lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockRejectedValueOnce(new Error('db boom'));

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to list crew intents');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
