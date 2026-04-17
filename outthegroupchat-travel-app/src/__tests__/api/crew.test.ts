/**
 * Unit tests for the Crew API (Phase 3).
 *
 * Routes covered:
 *   POST   /api/crew/request         — send a Crew request
 *   GET    /api/crew                 — list accepted Crew members
 *   GET    /api/crew/requests        — list pending (incoming + sent)
 *   PATCH  /api/crew/[id]            — accept / decline / block
 *   DELETE /api/crew/[id]            — remove / cancel
 *   GET    /api/crew/status/[userId] — status lookup (for CrewButton)
 *
 * The Prisma, NextAuth, logger, sentry, email mocks are defined in
 * src/__tests__/setup.ts. This file additionally mocks @/lib/rate-limit
 * to avoid any real Upstash calls, and asserts on the email helpers where
 * they are invoked by the route handlers.
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

vi.mock('@/lib/email', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(true),
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendNotificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCrewRequestEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCrewAcceptedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { POST as requestPOST } from '@/app/api/crew/request/route';
import { GET as listGET } from '@/app/api/crew/route';
import { GET as requestsGET } from '@/app/api/crew/requests/route';
import { PATCH as patchById, DELETE as deleteById } from '@/app/api/crew/[id]/route';
import { GET as statusGET } from '@/app/api/crew/status/[userId]/route';
import { sendCrewRequestEmail, sendCrewAcceptedEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

const mockCheckRateLimit = vi.mocked(checkRateLimit);

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaCrew = prisma.crew as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaNotification = prisma.notification as unknown as {
  create: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures — userIds chosen so that A < B lexicographically
// ---------------------------------------------------------------------------
const USER_A = 'user-aaa-1111';
const USER_B = 'user-bbb-2222';
const USER_C = 'user-ccc-3333';
const CREW_ID = 'crew-row-xyz';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish the permanent rate-limit pass-through mock after reset.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  // Email helpers default to success between tests.
  vi.mocked(sendCrewRequestEmail).mockResolvedValue({ success: true });
  vi.mocked(sendCrewAcceptedEmail).mockResolvedValue({ success: true });
});

// ===========================================================================
// POST /api/crew/request
// ===========================================================================
describe('POST /api/crew/request', () => {
  const makeReq = (body: unknown) =>
    new NextRequest('http://localhost/api/crew/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await requestPOST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when requesting self', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await requestPOST(makeReq({ targetUserId: USER_A }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when target user missing', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(404);
  });

  it('creates a new Crew row with sorted IDs and fires notification + email', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A, 'Alice'));
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_B, email: 'bob@example.com', name: 'Bob' }) // target lookup
      .mockResolvedValueOnce({ name: 'Alice', crewLabel: 'Squad' }); // requester lookup
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    mockPrismaCrew.create.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(201);
    const createCall = mockPrismaCrew.create.mock.calls[0]?.[0];
    expect(createCall?.data).toMatchObject({
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    expect(sendCrewRequestEmail).toHaveBeenCalledTimes(1);
  });

  it('sorts the IDs correctly when requester ID is > target ID', async () => {
    // requester C, target A → should store userAId=A, userBId=C, requestedById=C
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C, 'Carol'));
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_A, email: 'a@example.com', name: 'Alice' })
      .mockResolvedValueOnce({ name: 'Carol', crewLabel: null });
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    mockPrismaCrew.create.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_C,
      status: 'PENDING',
      requestedById: USER_C,
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await requestPOST(makeReq({ targetUserId: USER_A }));
    expect(res.status).toBe(201);
    const createCall = mockPrismaCrew.create.mock.calls[0]?.[0];
    expect(createCall?.data.userAId).toBe(USER_A);
    expect(createCall?.data.userBId).toBe(USER_C);
    expect(createCall?.data.requestedById).toBe(USER_C);
  });

  it('returns 409 when row already ACCEPTED', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: USER_B,
      email: 'bob@example.com',
      name: 'Bob',
    });
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(409);
  });

  it('returns 409 when request already PENDING', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: USER_B,
      email: 'bob@example.com',
      name: 'Bob',
    });
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(409);
  });

  it('returns 403 when row is BLOCKED', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: USER_B,
      email: 'bob@example.com',
      name: 'Bob',
    });
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'BLOCKED',
      requestedById: USER_B,
    });
    const res = await requestPOST(makeReq({ targetUserId: USER_B }));
    expect(res.status).toBe(403);
  });

  it('reopens DECLINED row as PENDING with caller as new requester', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B, 'Bob'));
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_A, email: 'a@example.com', name: 'Alice' })
      .mockResolvedValueOnce({ name: 'Bob', crewLabel: null });
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'DECLINED',
      requestedById: USER_A,
    });
    mockPrismaCrew.update.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_B,
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await requestPOST(makeReq({ targetUserId: USER_A }));
    expect(res.status).toBe(201);
    expect(mockPrismaCrew.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrismaCrew.update.mock.calls[0]?.[0];
    expect(updateCall?.data).toMatchObject({ status: 'PENDING', requestedById: USER_B });
  });
});

// ===========================================================================
// GET /api/crew
// ===========================================================================
describe('GET /api/crew', () => {
  const makeReq = () => new NextRequest('http://localhost/api/crew');

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await listGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns accepted crew rows for the current user', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      {
        id: CREW_ID,
        userAId: USER_A,
        userBId: USER_B,
        status: 'ACCEPTED',
        requestedById: USER_A,
        userA: { id: USER_A, name: 'Alice', image: null, city: null, crewLabel: null },
        userB: { id: USER_B, name: 'Bob', image: null, city: null, crewLabel: null },
        requestedBy: { id: USER_A, name: 'Alice', image: null, city: null, crewLabel: null },
      },
    ]);
    mockPrismaCrew.count.mockResolvedValueOnce(1);

    const res = await listGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.items).toHaveLength(1);

    const whereArg = mockPrismaCrew.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.status).toBe('ACCEPTED');
  });
});

// ===========================================================================
// GET /api/crew/requests
// ===========================================================================
describe('GET /api/crew/requests', () => {
  const makeReq = () => new NextRequest('http://localhost/api/crew/requests');

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await requestsGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('splits pending rows into incoming vs sent based on requestedById', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      {
        id: 'crew-incoming',
        userAId: USER_A,
        userBId: USER_B,
        status: 'PENDING',
        requestedById: USER_A, // incoming to B
        createdAt: new Date(),
        userA: { id: USER_A, name: 'Alice', image: null, city: null, crewLabel: null },
        userB: { id: USER_B, name: 'Bob', image: null, city: null, crewLabel: null },
        requestedBy: { id: USER_A, name: 'Alice', image: null, city: null, crewLabel: null },
      },
      {
        id: 'crew-sent',
        userAId: USER_B,
        userBId: USER_C,
        status: 'PENDING',
        requestedById: USER_B, // sent by B
        createdAt: new Date(),
        userA: { id: USER_B, name: 'Bob', image: null, city: null, crewLabel: null },
        userB: { id: USER_C, name: 'Carol', image: null, city: null, crewLabel: null },
        requestedBy: { id: USER_B, name: 'Bob', image: null, city: null, crewLabel: null },
      },
    ]);

    const res = await requestsGET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.incoming).toHaveLength(1);
    expect(body.data.sent).toHaveLength(1);
    expect(body.data.incoming[0].id).toBe('crew-incoming');
    expect(body.data.sent[0].id).toBe('crew-sent');
  });
});

// ===========================================================================
// PATCH /api/crew/[id]
// ===========================================================================
describe('PATCH /api/crew/[id]', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/crew/${CREW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid action', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    const res = await patchById(makeReq({ action: 'hug' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when crew row missing', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not a participant', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(403);
  });

  it('returns 403 when requester tries to accept own request', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(403);
  });

  it('returns 409 when accepting a non-PENDING row', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(409);
  });

  it('accepts a pending request and fires CREW_ACCEPTED notification + email', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B, 'Bob'));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    mockPrismaCrew.update.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ name: 'Bob', crewLabel: null }) // accepter lookup
      .mockResolvedValueOnce({ id: USER_A, name: 'Alice', email: 'a@example.com' }); // requester lookup
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await patchById(makeReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'ACCEPTED' },
    });
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    const notifArg = mockPrismaNotification.create.mock.calls[0]?.[0]?.data;
    expect(notifArg?.userId).toBe(USER_A);
    expect(notifArg?.type).toBe('CREW_ACCEPTED');
    expect(sendCrewAcceptedEmail).toHaveBeenCalledTimes(1);
  });

  it('declines a pending request without firing accepted-email', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    mockPrismaCrew.update.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'DECLINED',
      requestedById: USER_A,
    });

    const res = await patchById(makeReq({ action: 'decline' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(sendCrewAcceptedEmail).not.toHaveBeenCalled();
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'DECLINED' },
    });
  });

  it('allows either participant to block', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    mockPrismaCrew.update.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'BLOCKED',
      requestedById: USER_A,
    });

    const res = await patchById(makeReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'BLOCKED' },
    });
  });
});

// ===========================================================================
// DELETE /api/crew/[id]
// ===========================================================================
describe('DELETE /api/crew/[id]', () => {
  const makeReq = () =>
    new NextRequest(`http://localhost/api/crew/${CREW_ID}`, { method: 'DELETE' });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await deleteById(makeReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when missing', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    const res = await deleteById(makeReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not a participant', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    const res = await deleteById(makeReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(403);
  });

  it('deletes when participant', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    mockPrismaCrew.delete.mockResolvedValueOnce({ id: CREW_ID });

    const res = await deleteById(makeReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.delete).toHaveBeenCalledWith({ where: { id: CREW_ID } });
  });
});

// ===========================================================================
// GET /api/crew/status/[userId]
// ===========================================================================
describe('GET /api/crew/status/[userId]', () => {
  const makeReq = () => new NextRequest('http://localhost/api/crew/status/x');

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await statusGET(makeReq(), { params: { userId: USER_B } });
    expect(res.status).toBe(401);
  });

  it('returns SELF when asking about own id', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await statusGET(makeReq(), { params: { userId: USER_A } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('SELF');
  });

  it('returns NOT_IN_CREW when no row exists', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    const res = await statusGET(makeReq(), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('NOT_IN_CREW');
    expect(body.data.crewId).toBeNull();
  });

  it('returns row status and iAmRequester=true when caller initiated', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    const res = await statusGET(makeReq(), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('PENDING');
    expect(body.data.crewId).toBe(CREW_ID);
    expect(body.data.iAmRequester).toBe(true);
  });

  it('returns iAmRequester=false when other side initiated', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    const res = await statusGET(makeReq(), { params: { userId: USER_A } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.iAmRequester).toBe(false);
  });
});
