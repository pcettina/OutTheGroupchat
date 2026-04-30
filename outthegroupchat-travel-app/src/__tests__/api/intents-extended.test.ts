/**
 * Extended unit tests for V1 Intent API routes (mine, crew, [id]).
 *
 * Complements src/__tests__/api/intents.test.ts with coverage of:
 *   - Rate-limit (429) on every method
 *   - Query-parameter validation (400) on the GET routes
 *   - state filter, limit clamping, topicId filtering
 *   - PATCH validation: empty body, invalid datetime, dayOffset out of range,
 *                       endAt <= startAt window error
 *   - PATCH unauthenticated, missing id, invalid JSON
 *   - DELETE unauthenticated, missing id, rate-limit
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from
 * src/__tests__/setup.ts. Rate-limit is mocked locally so we can re-arm
 * mockResolvedValue after vi.resetAllMocks() in beforeEach.
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

import { GET as GET_MINE } from '@/app/api/intents/mine/route';
import { GET as GET_CREW } from '@/app/api/intents/crew/route';
import { PATCH as PATCH_INTENT, DELETE as DELETE_INTENT } from '@/app/api/intents/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockPrismaIntent = prisma.intent as unknown as {
  create: MockFn;
  findMany: MockFn;
  findUnique: MockFn;
  update: MockFn;
  deleteMany: MockFn;
  count: MockFn;
};
const mockPrismaCrew = prisma.crew as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-1',
  topicId: 'cltopic1234567890drinks0',
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
  ...over,
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

const makePatchReq = (body: unknown) =>
  new NextRequest('http://localhost/api/intents/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const makePatchReqRaw = (raw: string) =>
  new NextRequest('http://localhost/api/intents/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/intents/x', { method: 'DELETE' });

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/intents/mine — extended
// ===========================================================================
describe('GET /api/intents/mine — extended', () => {
  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(429);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('400 on invalid state enum', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { state: 'NOT_A_REAL_STATE' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('400 when limit exceeds the max (>100)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { limit: '500' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when limit is zero', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { limit: '0' }),
    );
    expect(res.status).toBe(400);
  });

  it('200 applies state filter when state=COMMITTED', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ state: 'COMMITTED' }),
    ]);

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { state: 'COMMITTED' }),
    );
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.state).toBe('COMMITTED');
    expect(where.userId).toBe('user-1');
  });

  it('200 forwards limit param to take', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { limit: '25' }),
    );
    expect(res.status).toBe(200);
    expect(mockPrismaIntent.findMany.mock.calls[0][0].take).toBe(25);
  });

  it('500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// GET /api/intents/crew — extended
// ===========================================================================
describe('GET /api/intents/crew — extended', () => {
  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(429);
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 on invalid topicId (not a cuid)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: 'not-a-cuid' }),
    );
    expect(res.status).toBe(400);
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 when limit > 100', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { limit: '101' }),
    );
    expect(res.status).toBe(400);
  });

  it('200 applies topicId filter when present', async () => {
    const TOPIC_ID = 'cltopic1234567890drinks0';
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ userId: 'user-2', topicId: TOPIC_ID }),
    ]);

    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: TOPIC_ID }),
    );
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.topicId).toBe(TOPIC_ID);
    expect(where.state).toBe('INTERESTED');
  });

  it('200 only queries crews where caller is userA OR userB with ACCEPTED status', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-7'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);

    const crewWhere = mockPrismaCrew.findMany.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    expect(crewWhere.OR).toEqual([
      { userAId: 'user-7' },
      { userBId: 'user-7' },
    ]);
  });

  it('500 when prisma.crew.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PATCH /api/intents/[id] — extended
// ===========================================================================
describe('PATCH /api/intents/[id] — extended', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(429);
    expect(mockPrismaIntent.findUnique).not.toHaveBeenCalled();
  });

  it('400 when id is empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), {
      params: { id: '' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Intent id required');
  });

  it('400 on invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReqRaw('not-json'), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('400 on empty body (no fields to update)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq({}), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('400 on dayOffset > MAX_DAY_OFFSET (8)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq({ dayOffset: 8 }), params);
    expect(res.status).toBe(400);
  });

  it('400 on negative dayOffset', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq({ dayOffset: -1 }), params);
    expect(res.status).toBe(400);
  });

  it('400 on non-datetime startAt string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(
      makePatchReq({ startAt: 'last tuesday' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid state enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(
      makePatchReq({ state: 'BOGUS_STATE' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid venueId (not a cuid)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(
      makePatchReq({ venueId: 'not-a-cuid' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when window endAt <= startAt (resolveIntentWindow throws)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });

    const startAt = '2099-01-02T20:00:00.000+00:00';
    const endAt = '2099-01-02T19:00:00.000+00:00'; // before startAt
    const res = await PATCH_INTENT(
      makePatchReq({ startAt, endAt }),
      params,
    );
    expect(res.status).toBe(400);
    expect(mockPrismaIntent.update).not.toHaveBeenCalled();
  });

  it('200 updates cityArea without recomputing window', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(
      fakeIntent({ cityArea: 'East Village' }),
    );

    const res = await PATCH_INTENT(
      makePatchReq({ cityArea: 'East Village' }),
      params,
    );
    expect(res.status).toBe(200);

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.cityArea).toBe('East Village');
    expect(updateCall.data.expiresAt).toBeUndefined();
    expect(updateCall.data.windowPreset).toBeUndefined();
  });

  it('200 clears cityArea when set to null', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent());

    const res = await PATCH_INTENT(makePatchReq({ cityArea: null }), params);
    expect(res.status).toBe(200);

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.cityArea).toBeNull();
  });

  it('500 when prisma.intent.findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// DELETE /api/intents/[id] — extended
// ===========================================================================
describe('DELETE /api/intents/[id] — extended', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(429);
    expect(mockPrismaIntent.findUnique).not.toHaveBeenCalled();
  });

  it('400 when id is empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await DELETE_INTENT(makeDeleteReq(), { params: { id: '' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Intent id required');
  });

  it('200 returns the expired row shape', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    const expiredAt = new Date();
    mockPrismaIntent.update.mockResolvedValueOnce({
      id: 'intent-xyz',
      expiresAt: expiredAt,
    });

    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('intent-xyz');
  });

  it('500 when prisma.intent.update throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    mockPrismaIntent.update.mockRejectedValueOnce(new Error('db down'));

    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(500);
  });
});
