/**
 * Supplemental test suite for crew block/email behavior (Phase 8).
 *
 * Routes covered:
 *   PATCH  /api/crew/[id]      — block from various statuses, email edge cases
 *   DELETE /api/crew/[id]      — cancel/remove/unblock across all statuses
 *   POST   /api/crew/request   — email NOT sent when target has no email address
 *
 * The Prisma, NextAuth, logger, sentry, and rate-limit mocks are provided by
 * src/__tests__/setup.ts. This file adds its own @/lib/email mock to assert on
 * sendCrewRequestEmail and sendCrewAcceptedEmail call counts.
 *
 * DO NOT duplicate tests already present in crew.test.ts. This file covers:
 *   - block action from PENDING status (non-recipient can block)
 *   - block action from BLOCKED status (idempotent re-block)
 *   - block action from DECLINED status
 *   - accept fires email only when requester has an email address
 *   - accept skips email when requester has no email
 *   - crew request skips email when target has no email
 *   - crew request re-open (DECLINED→PENDING) skips email when target has no email
 *   - rate limit exceeded on PATCH returns 429
 *   - rate limit exceeded on DELETE returns 429
 *   - DELETE on PENDING row (cancel flow)
 *   - DELETE on BLOCKED row (unblock flow)
 *   - DELETE on DECLINED row (clean-up flow)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module mocks — must appear before route imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// The routes import from @/lib/email, not @/lib/email-crew.
vi.mock('@/lib/email', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(true),
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendNotificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCrewRequestEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCrewAcceptedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { PATCH as patchById, DELETE as deleteById } from '@/app/api/crew/[id]/route';
import { POST as requestPOST } from '@/app/api/crew/request/route';
import { sendCrewRequestEmail, sendCrewAcceptedEmail } from '@/lib/email';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

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
// Fixtures
// ---------------------------------------------------------------------------

// Chosen so USER_A < USER_B < USER_C lexicographically (for sorted-ID logic).
const USER_A = 'user-aaa-1111';
const USER_B = 'user-bbb-2222';
const USER_C = 'user-ccc-3333';
const CREW_ID = 'crew-block-email-xyz';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();

  // Restore rate-limit pass-through after vi.resetAllMocks() wipes it.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  mockGetRateLimitHeaders.mockReturnValue({});

  // Default email stubs.
  vi.mocked(sendCrewRequestEmail).mockResolvedValue({ success: true });
  vi.mocked(sendCrewAcceptedEmail).mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePatchReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/crew/${CREW_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeDeleteReq = () =>
  new NextRequest(`http://localhost/api/crew/${CREW_ID}`, { method: 'DELETE' });

const makeRequestReq = (body: unknown) =>
  new NextRequest('http://localhost/api/crew/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ===========================================================================
// PATCH /api/crew/[id] — block edge cases
// ===========================================================================
describe('PATCH /api/crew/[id] — block edge cases', () => {
  it('blocks a PENDING row as the recipient (non-requester)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B));
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
      status: 'BLOCKED',
      requestedById: USER_A,
    });

    const res = await patchById(makePatchReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('BLOCKED');
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'BLOCKED' },
    });
  });

  it('blocks a PENDING row as the requester (requester can also block)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
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
      status: 'BLOCKED',
      requestedById: USER_A,
    });

    const res = await patchById(makePatchReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'BLOCKED' },
    });
  });

  it('re-blocks an already-BLOCKED row (idempotent)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'BLOCKED',
      requestedById: USER_A,
    });
    mockPrismaCrew.update.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'BLOCKED',
      requestedById: USER_A,
    });

    const res = await patchById(makePatchReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.update).toHaveBeenCalledWith({
      where: { id: CREW_ID },
      data: { status: 'BLOCKED' },
    });
  });

  it('blocks a DECLINED row', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B));
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
      status: 'BLOCKED',
      requestedById: USER_A,
    });

    const res = await patchById(makePatchReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('BLOCKED');
  });

  it('block action does not fire any email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
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

    await patchById(makePatchReq({ action: 'block' }), { params: { id: CREW_ID } });
    expect(sendCrewAcceptedEmail).not.toHaveBeenCalled();
    expect(sendCrewRequestEmail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/crew/[id] — accept email edge cases
// ===========================================================================
describe('PATCH /api/crew/[id] — accept email behavior', () => {
  it('skips sending accepted-email when requester has no email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B, 'Bob'));
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
    // accepter lookup returns name/crewLabel
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ name: 'Bob', crewLabel: 'Crew' })
      // requester lookup returns no email
      .mockResolvedValueOnce({ id: USER_A, name: 'Alice', email: null });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await patchById(makePatchReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    // Notification is still created even without email.
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    // Email must NOT fire when requester.email is null.
    expect(sendCrewAcceptedEmail).not.toHaveBeenCalled();
  });

  it('sends accepted-email with correct params when requester has email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B, 'Bob'));
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
      .mockResolvedValueOnce({ name: 'Bob', crewLabel: 'Squad' })
      .mockResolvedValueOnce({ id: USER_A, name: 'Alice', email: 'alice@example.com' });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await patchById(makePatchReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(sendCrewAcceptedEmail).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendCrewAcceptedEmail).mock.calls[0]?.[0];
    expect(emailArgs).toMatchObject({
      to: 'alice@example.com',
      requesterName: 'Alice',
      accepterName: 'Bob',
      accepterCrewLabel: 'Squad',
      crewId: CREW_ID,
    });
  });

  it('decline action does not fire accepted-email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B));
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

    const res = await patchById(makePatchReq({ action: 'decline' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(sendCrewAcceptedEmail).not.toHaveBeenCalled();
    expect(sendCrewRequestEmail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/crew/[id] — rate limit
// ===========================================================================
describe('PATCH /api/crew/[id] — rate limit', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 9999999999,
    });

    const res = await patchById(makePatchReq({ action: 'accept' }), { params: { id: CREW_ID } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rate limit/i);
  });
});

// ===========================================================================
// DELETE /api/crew/[id] — status coverage
// ===========================================================================
describe('DELETE /api/crew/[id] — status coverage', () => {
  it('cancels a PENDING row (requester cancels their own request)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    mockPrismaCrew.delete.mockResolvedValueOnce({ id: CREW_ID });

    const res = await deleteById(makeDeleteReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaCrew.delete).toHaveBeenCalledWith({ where: { id: CREW_ID } });
  });

  it('removes an ACCEPTED row (either participant can leave)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'ACCEPTED',
      requestedById: USER_A,
    });
    mockPrismaCrew.delete.mockResolvedValueOnce({ id: CREW_ID });

    const res = await deleteById(makeDeleteReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.delete).toHaveBeenCalledWith({ where: { id: CREW_ID } });
  });

  it('removes a DECLINED row (clean-up flow)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'DECLINED',
      requestedById: USER_A,
    });
    mockPrismaCrew.delete.mockResolvedValueOnce({ id: CREW_ID });

    const res = await deleteById(makeDeleteReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    expect(mockPrismaCrew.delete).toHaveBeenCalledWith({ where: { id: CREW_ID } });
  });

  it('removes a BLOCKED row (unblock flow)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockPrismaCrew.findUnique.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'BLOCKED',
      requestedById: USER_A,
    });
    mockPrismaCrew.delete.mockResolvedValueOnce({ id: CREW_ID });

    const res = await deleteById(makeDeleteReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Crew removed');
    expect(mockPrismaCrew.delete).toHaveBeenCalledWith({ where: { id: CREW_ID } });
  });
});

// ===========================================================================
// DELETE /api/crew/[id] — rate limit
// ===========================================================================
describe('DELETE /api/crew/[id] — rate limit', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 9999999999,
    });

    const res = await deleteById(makeDeleteReq(), { params: { id: CREW_ID } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rate limit/i);
  });
});

// ===========================================================================
// POST /api/crew/request — email edge cases
// ===========================================================================
describe('POST /api/crew/request — email edge cases', () => {
  it('skips sending request-email when target has no email (new row)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_A, 'Alice'));
    // Target user has no email.
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_B, email: null, name: 'Bob' })
      .mockResolvedValueOnce({ name: 'Alice', crewLabel: null });
    mockPrismaCrew.findUnique.mockResolvedValueOnce(null);
    mockPrismaCrew.create.mockResolvedValueOnce({
      id: CREW_ID,
      userAId: USER_A,
      userBId: USER_B,
      status: 'PENDING',
      requestedById: USER_A,
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await requestPOST(makeRequestReq({ targetUserId: USER_B }));
    expect(res.status).toBe(201);
    // Notification still fires even without email.
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    // Email must NOT fire when targetUser.email is null/undefined.
    expect(sendCrewRequestEmail).not.toHaveBeenCalled();
  });

  it('skips sending request-email on re-open (DECLINED→PENDING) when target has no email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B, 'Bob'));
    // Target (USER_A) has no email.
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_A, email: null, name: 'Alice' })
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

    const res = await requestPOST(makeRequestReq({ targetUserId: USER_A }));
    expect(res.status).toBe(201);
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    expect(sendCrewRequestEmail).not.toHaveBeenCalled();
  });

  it('sends request-email with correct params when target has email (re-open path)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_B, 'Bob'));
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: USER_A, email: 'alice@example.com', name: 'Alice' })
      .mockResolvedValueOnce({ name: 'Bob', crewLabel: 'Crew' });
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

    const res = await requestPOST(makeRequestReq({ targetUserId: USER_A }));
    expect(res.status).toBe(201);
    expect(sendCrewRequestEmail).toHaveBeenCalledTimes(1);
    const emailArgs = vi.mocked(sendCrewRequestEmail).mock.calls[0]?.[0];
    expect(emailArgs).toMatchObject({
      to: 'alice@example.com',
      recipientName: 'Alice',
      senderName: 'Bob',
      senderCrewLabel: 'Crew',
      crewId: CREW_ID,
    });
  });
});
