/**
 * Unit tests for V1 Intent detail / scoped endpoints:
 *   PATCH  /api/intents/[id]
 *   DELETE /api/intents/[id]
 *   GET    /api/intents/mine
 *   GET    /api/intents/crew
 *
 * Covers ownership enforcement, validation, expired handling, pagination,
 * and crew-scoping.
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

const TOPIC_ID = 'cltopic1234567890drinks0';

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-1',
  topicId: TOPIC_ID,
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

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/intents/x', { method: 'DELETE' });

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// PATCH /api/intents/[id]
// ===========================================================================
describe('PATCH /api/intents/[id]', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(429);
  });

  it('400 when body is invalid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq('not-json'), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
  });

  it('400 when no fields are provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(makePatchReq({}), params);
    expect(res.status).toBe(400);
  });

  it('400 on Zod failure (invalid state enum)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(
      makePatchReq({ state: 'NOT_A_REAL_STATE' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 on Zod failure (cityArea too long)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_INTENT(
      makePatchReq({ cityArea: 'x'.repeat(101) }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('404 when intent does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(404);
  });

  it('403 when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-2',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(403);
    expect(mockPrismaIntent.update).not.toHaveBeenCalled();
  });

  it('200 patches cityArea without recomputing window', async () => {
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

  it('200 recomputes expiresAt when windowPreset changes', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent());

    const res = await PATCH_INTENT(
      makePatchReq({ windowPreset: 'NIGHT' }),
      params,
    );
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.windowPreset).toBe('NIGHT');
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
  });

  it('200 transitions INTERESTED → COMMITTED without window change', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(
      fakeIntent({ state: 'COMMITTED' }),
    );
    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.state).toBe('COMMITTED');
    expect(updateCall.data.expiresAt).toBeUndefined();
  });

  it('200 nullifies cityArea when explicitly null', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent({ cityArea: null }));

    const res = await PATCH_INTENT(makePatchReq({ cityArea: null }), params);
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.cityArea).toBeNull();
  });
});

// ===========================================================================
// DELETE /api/intents/[id]
// ===========================================================================
describe('DELETE /api/intents/[id]', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(429);
  });

  it('404 when intent missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(404);
    expect(mockPrismaIntent.update).not.toHaveBeenCalled();
  });

  it('403 when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-2' });
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(403);
    expect(mockPrismaIntent.update).not.toHaveBeenCalled();
  });

  it('200 manually expires by setting expiresAt to now', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    const expiredAt = new Date();
    mockPrismaIntent.update.mockResolvedValueOnce({
      id: 'intent-xyz',
      expiresAt: expiredAt,
    });

    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    const drift = Math.abs(updateCall.data.expiresAt.getTime() - Date.now());
    expect(drift).toBeLessThan(5000);
  });

  it('does not hard-delete the row (preserves audit trail)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    mockPrismaIntent.update.mockResolvedValueOnce({
      id: 'intent-xyz',
      expiresAt: new Date(),
    });

    await DELETE_INTENT(makeDeleteReq(), params);
    expect(mockPrismaIntent.update).toHaveBeenCalledTimes(1);
    expect(mockPrismaIntent.deleteMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/intents/mine
// ===========================================================================
describe('GET /api/intents/mine', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(429);
  });

  it('400 on invalid query parameter (limit > 100)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { limit: '999' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid state enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { state: 'NOT_A_STATE' }),
    );
    expect(res.status).toBe(400);
  });

  it('200 default filters out expired intents', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([fakeIntent()]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('200 with includeExpired=true drops expiresAt filter', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(
      makeGetReq('/api/intents/mine', { includeExpired: 'true' }),
    );
    expect(res.status).toBe(200);
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.expiresAt).toBeUndefined();
  });

  it('200 narrows by state when state=COMMITTED', async () => {
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
  });

  it('200 honours limit pagination param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/intents/mine', { limit: '10' }));
    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.take).toBe(10);
  });

  it('200 default limit is 50 when not supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/intents/mine'));
    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
  });

  it('200 only returns the caller’s intents (userId scoped)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/intents/mine'));
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-42');
  });

  it('500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(500);
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
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(429);
  });

  it('400 on invalid topicId (not a cuid)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: 'not-a-cuid' }),
    );
    expect(res.status).toBe(400);
  });

  it('200 returns empty array when caller has no Crew (short-circuits)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toEqual([]);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });

  it('200 maps Crew rows to other-user ids regardless of A/B position', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_CREW(makeGetReq('/api/intents/crew'));
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(['user-2', 'user-3']);
  });

  it('200 only queries ACCEPTED Crew rows for caller', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    await GET_CREW(makeGetReq('/api/intents/crew'));
    const crewWhere = mockPrismaCrew.findMany.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    expect(crewWhere.OR).toEqual([
      { userAId: 'user-1' },
      { userBId: 'user-1' },
    ]);
  });

  it('200 filters to INTERESTED state and live (non-expired) only', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ userId: 'user-2' }),
    ]);

    await GET_CREW(makeGetReq('/api/intents/crew'));
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.state).toBe('INTERESTED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('200 narrows by topicId when supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_CREW(
      makeGetReq('/api/intents/crew', { topicId: TOPIC_ID }),
    );
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.topicId).toBe(TOPIC_ID);
  });

  it('200 honours limit pagination (max 100)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_CREW(makeGetReq('/api/intents/crew', { limit: '25' }));
    const args = mockPrismaIntent.findMany.mock.calls[0][0];
    expect(args.take).toBe(25);
  });

  it('400 when limit exceeds max (101)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CREW(
      makeGetReq('/api/intents/crew', { limit: '101' }),
    );
    expect(res.status).toBe(400);
  });

  it('caller never sees their own intents (userId is in crewIds set)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    await GET_CREW(makeGetReq('/api/intents/crew'));
    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId.in).not.toContain('user-1');
    expect(where.userId.in).toEqual(['user-2', 'user-3']);
  });

  it('500 when prisma throws on crew lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(500);
  });
});
