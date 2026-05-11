/**
 * Extended coverage for /api/subcrews/* sub-routes (Phase 8 E2E hot paths).
 *
 * Complements existing api/subcrews.test.ts + api/subcrew-coordination.test.ts
 * by exercising query-param validation, rate-limit responses, malformed JSON,
 * and edge branches not asserted elsewhere:
 *   GET    /api/subcrews/mine            — includeExpired / limit / 429 / RL bound
 *   GET    /api/subcrews/emerging        — limit / 429 / invalid query
 *   GET    /api/subcrews/[id]            — empty id (skip — handled by Next router) / 429
 *   POST   /api/subcrews/[id]/commit     — malformed JSON / invalid intentId cuid
 *   POST   /api/subcrews/[id]/join       — RL 429 / member.create call shape
 *   PATCH  /api/subcrews/[id]/members/me — malformed JSON / invalid datetime / 429
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

import { GET as GET_MINE } from '@/app/api/subcrews/mine/route';
import { GET as GET_EMERGING } from '@/app/api/subcrews/emerging/route';
import { GET as GET_ONE } from '@/app/api/subcrews/[id]/route';
import { POST as POST_JOIN } from '@/app/api/subcrews/[id]/join/route';
import { POST as POST_COMMIT } from '@/app/api/subcrews/[id]/commit/route';
import { PATCH as PATCH_MEMBER_ME } from '@/app/api/subcrews/[id]/members/me/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as {
  findMany: MockFn;
  findUnique: MockFn;
};
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
  create: MockFn;
  update: MockFn;
};
const mockCrew = prisma.crew as unknown as { findMany: MockFn; findFirst: MockFn };
const mockIntent = prisma.intent as unknown as {
  findFirst: MockFn;
  findUnique: MockFn;
};
const mockNotification = prisma.notification as unknown as { createMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_BLOCK = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

const makePostReq = (path: string) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST' });

const makeJsonReq = (method: string, body: unknown, path = '/api/subcrews/sc-1') =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// NextRequest with a deliberately malformed JSON body (body string, not JSON).
const makeBadJsonReq = (method: string, path = '/api/subcrews/sc-1') =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: '{not-json',
  });

const params = { params: { id: 'sc-1' } };

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/subcrews/mine
// ===========================================================================
describe('GET /api/subcrews/mine — coverage gaps', () => {
  it('400 on non-numeric limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_MINE(makeGetReq('/api/subcrews/mine', { limit: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('400 on limit above max (>100)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_MINE(makeGetReq('/api/subcrews/mine', { limit: '500' }));
    expect(res.status).toBe(400);
  });

  it('includeExpired=true omits endAt filter from prisma where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(
      makeGetReq('/api/subcrews/mine', { includeExpired: 'true' }),
    );
    expect(res.status).toBe(200);
    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.endAt).toBeUndefined();
    expect(where.members.some.userId).toBe('user-1');
  });

  it('429 when rate limit blocks', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// GET /api/subcrews/emerging
// ===========================================================================
describe('GET /api/subcrews/emerging — coverage gaps', () => {
  it('400 on invalid limit (>50)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_EMERGING(
      makeGetReq('/api/subcrews/emerging', { limit: '200' }),
    );
    expect(res.status).toBe(400);
  });

  it('429 when rate limit blocks', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);
    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(429);
  });

  it('honors custom limit query param into findMany.take', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(
      makeGetReq('/api/subcrews/emerging', { limit: '5' }),
    );
    expect(res.status).toBe(200);
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(5);
  });
});

// ===========================================================================
// GET /api/subcrews/[id]
// ===========================================================================
describe('GET /api/subcrews/[id] — coverage gaps', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate limit blocks (auth passes)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);
    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(429);
  });

  it('400 when id param is empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_ONE(makeGetReq('/api/subcrews/'), {
      params: { id: '' },
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/join
// ===========================================================================
describe('POST /api/subcrews/[id]/join — coverage gaps', () => {
  it('429 when rate limit blocks', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(429);
  });

  it('400 when id param is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_JOIN(makePostReq('/api/subcrews//join'), {
      params: { id: '' },
    });
    expect(res.status).toBe(400);
  });

  it('skipDuplicates flag forwarded to notification.createMany', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C', 'Charlie'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'member-x',
      joinedAt: new Date(),
    });

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(201);
    const notifCall = mockNotification.createMany.mock.calls[0][0];
    expect(notifCall.skipDuplicates).toBe(true);
    // Caller name "Charlie" should appear in notification message.
    expect(notifCall.data[0].message).toContain('Charlie');
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/commit
// ===========================================================================
describe('POST /api/subcrews/[id]/commit — coverage gaps', () => {
  it('400 on malformed JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(makeBadJsonReq('POST'), params);
    expect(res.status).toBe(400);
  });

  it('400 on missing intentId field', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(makeJsonReq('POST', {}), params);
    expect(res.status).toBe(400);
  });

  it('400 when intentId is not a valid cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'not-a-cuid' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when socialScope enum value is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: 'cliab1234567890abcdefghi',
        socialScope: 'EVERYONE_IN_THE_WORLD',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('429 when rate limit blocks', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// PATCH /api/subcrews/[id]/members/me
// ===========================================================================
describe('PATCH /api/subcrews/[id]/members/me — coverage gaps', () => {
  it('400 on malformed JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(makeBadJsonReq('PATCH'), params);
    expect(res.status).toBe(400);
  });

  it('400 when proposedTime is not a valid datetime', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: 'tomorrow at 8' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when proposedTime field is omitted (required key)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(makeJsonReq('PATCH', {}), params);
    expect(res.status).toBe(400);
  });

  it('429 when rate limit blocks', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(429);
  });

  it('400 when id param is empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      { params: { id: '' } },
    );
    expect(res.status).toBe(400);
  });
});
