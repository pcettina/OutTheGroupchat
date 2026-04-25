/**
 * Unit tests for V1 Phase 1 Intent API:
 *   POST   /api/intents
 *   GET    /api/intents/mine
 *   GET    /api/intents/crew
 *   PATCH  /api/intents/[id]
 *   DELETE /api/intents/[id]
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

import { POST as POST_INTENT } from '@/app/api/intents/route';
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
const mockPrismaTopic = prisma.topic as unknown as { findMany: MockFn };
const mockPrismaCrew = prisma.crew as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const TOPIC_DRINKS = {
  id: 'cltopic1234567890drinks0',
  keywords: ['drinks', 'beer', 'cocktail'],
};

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-1',
  topicId: TOPIC_DRINKS.id,
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

const makePostReq = (body: unknown) =>
  new NextRequest('http://localhost/api/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    body: JSON.stringify(body),
  });

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/intents/x', { method: 'DELETE' });

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// POST /api/intents
// ===========================================================================
describe('POST /api/intents', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST_INTENT(
      makePostReq({ rawText: 'drinks', windowPreset: 'EVENING' }),
    );
    expect(res.status).toBe(401);
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await POST_INTENT(
      makePostReq({ rawText: 'drinks', windowPreset: 'EVENING' }),
    );
    expect(res.status).toBe(429);
  });

  it('400 on invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const req = new NextRequest('http://localhost/api/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST_INTENT(req);
    expect(res.status).toBe(400);
  });

  it('400 on validation failure (missing windowPreset)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_INTENT(makePostReq({ rawText: 'drinks' }));
    expect(res.status).toBe(400);
  });

  it('422 needsTopicPicker when classifier returns no match', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([TOPIC_DRINKS]);
    const res = await POST_INTENT(
      makePostReq({ rawText: 'thinking about taxes', windowPreset: 'EVENING' }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.needsTopicPicker).toBe(true);
  });

  it('201 creates Intent when classifier matches', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([TOPIC_DRINKS]);
    mockPrismaIntent.create.mockResolvedValueOnce(fakeIntent());

    const res = await POST_INTENT(
      makePostReq({ rawText: 'drinks tonight', windowPreset: 'EVENING' }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('cli12345intent000000001');
    expect(body.matchedKeywords).toContain('drinks');

    const createCall = mockPrismaIntent.create.mock.calls[0][0];
    expect(createCall.data.userId).toBe('user-1');
    expect(createCall.data.topicId).toBe(TOPIC_DRINKS.id);
    expect(createCall.data.expiresAt).toBeInstanceOf(Date);
  });

  it('201 creates Intent when explicit topicId is supplied (skips classifier)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.create.mockResolvedValueOnce(fakeIntent());

    const res = await POST_INTENT(
      makePostReq({
        topicId: TOPIC_DRINKS.id,
        windowPreset: 'NIGHT',
        dayOffset: 1,
      }),
    );

    expect(res.status).toBe(201);
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
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

  it('200 returns caller live intents', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([fakeIntent()]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toHaveLength(1);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    // Default filters out expired
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('200 with includeExpired=true drops the expiresAt filter', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(makeGetReq('/api/intents/mine', { includeExpired: 'true' }));
    expect(res.status).toBe(200);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.expiresAt).toBeUndefined();
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

  it('200 returns Crew intents (excluding caller)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([
      fakeIntent({ userId: 'user-2' }),
      fakeIntent({ userId: 'user-3' }),
    ]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toHaveLength(2);

    const where = mockPrismaIntent.findMany.mock.calls[0][0].where;
    expect(where.userId.in).toEqual(['user-2', 'user-3']);
    expect(where.state).toBe('INTERESTED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('200 returns empty array when caller has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_CREW(makeGetReq('/api/intents/crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.intents).toEqual([]);
    // Should short-circuit before querying intents
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/intents/[id]
// ===========================================================================
describe('PATCH /api/intents/[id]', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('404 when intent missing', async () => {
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
  });

  it('200 transitions INTERESTED → COMMITTED', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      windowPreset: 'EVENING',
      dayOffset: 0,
      startAt: null,
      endAt: null,
    });
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent({ state: 'COMMITTED' }));

    const res = await PATCH_INTENT(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.state).toBe('COMMITTED');
    // Window not changed → no recomputed expiresAt
    expect(updateCall.data.expiresAt).toBeUndefined();
  });

  it('200 recomputes expiresAt when window fields change', async () => {
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
      makePatchReq({ windowPreset: 'NIGHT', dayOffset: 1 }),
      params,
    );
    expect(res.status).toBe(200);
    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.windowPreset).toBe('NIGHT');
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// DELETE /api/intents/[id]
// ===========================================================================
describe('DELETE /api/intents/[id]', () => {
  const params = { params: { id: 'intent-xyz' } };

  it('404 when intent missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(404);
  });

  it('403 when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-2' });
    const res = await DELETE_INTENT(makeDeleteReq(), params);
    expect(res.status).toBe(403);
  });

  it('200 sets expiresAt to now (manual expiry)', async () => {
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
    // expiresAt should be ≈ now (within 5 seconds)
    const drift = Math.abs(updateCall.data.expiresAt.getTime() - Date.now());
    expect(drift).toBeLessThan(5000);
  });
});
