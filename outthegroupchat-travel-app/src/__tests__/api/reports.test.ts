/**
 * Unit tests for the Trust & Safety reports API (Day 6 — Trust & Safety II).
 *
 * Routes covered:
 *   POST /api/reports  — file a report against a USER or MEETUP (idempotent)
 *   GET  /api/reports  — admin-only list (env-allowlist gated), optional status filter
 *
 * The Prisma (incl. `report`), NextAuth, logger, and sentry mocks are defined
 * in src/__tests__/setup.ts. This file additionally mocks @/lib/rate-limit to
 * avoid any real Upstash calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  creationQuotaLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST as reportPOST, GET as reportGET } from '@/app/api/reports/route';
import { checkRateLimit } from '@/lib/rate-limit';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

const mockReport = prisma.report as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockMeetup = prisma.meetup as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_A = 'user-aaa-1111';
const USER_B = 'user-bbb-2222';
const MEETUP_1 = 'meetup-ccc-3333';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeReq = (body: unknown) =>
  new NextRequest('http://localhost/api/reports', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const makeGetReq = (query = '') =>
  new NextRequest(`http://localhost/api/reports${query}`, { method: 'GET' });

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm the permanent rate-limit pass-through after vi.resetAllMocks().
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  // Defaults: no existing open report; targets resolve to existing rows.
  mockReport.findFirst.mockResolvedValue(null);
  mockUser.findUnique.mockResolvedValue({ id: USER_B });
  mockMeetup.findUnique.mockResolvedValue({ id: MEETUP_1 });
});

// ===========================================================================
// POST /api/reports
// ===========================================================================
describe('POST /api/reports', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_B, reason: 'SPAM' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when reporting yourself', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_A, reason: 'HARASSMENT' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('You cannot report yourself');
  });

  it('returns 404 when the target user does not exist', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockUser.findUnique.mockResolvedValueOnce(null);
    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_B, reason: 'SPAM' })
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the target meetup does not exist', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await reportPOST(
      makeReq({ targetType: 'MEETUP', targetId: MEETUP_1, reason: 'SPAM' })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the reason is invalid (Zod)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_B, reason: 'NOT_A_REASON' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_B, reason: 'SPAM' })
    );
    expect(res.status).toBe(429);
  });

  it('creates a USER report (201) with the correct targetUserId/targetMeetupId', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockReport.create.mockResolvedValueOnce({
      id: 'report-1',
      reporterId: USER_A,
      targetType: 'USER',
      targetUserId: USER_B,
      targetMeetupId: null,
      reason: 'HARASSMENT',
      status: 'PENDING',
    });

    const res = await reportPOST(
      makeReq({
        targetType: 'USER',
        targetId: USER_B,
        reason: 'HARASSMENT',
        details: 'abusive DMs',
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ reporterId: USER_A, targetUserId: USER_B });

    expect(mockReport.create).toHaveBeenCalledTimes(1);
    const createArg = mockReport.create.mock.calls[0]?.[0];
    expect(createArg?.data).toEqual({
      reporterId: USER_A,
      targetType: 'USER',
      targetUserId: USER_B,
      targetMeetupId: null,
      reason: 'HARASSMENT',
      details: 'abusive DMs',
    });
  });

  it('creates a MEETUP report (201) with targetMeetupId set and targetUserId null', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockReport.create.mockResolvedValueOnce({
      id: 'report-2',
      reporterId: USER_A,
      targetType: 'MEETUP',
      targetUserId: null,
      targetMeetupId: MEETUP_1,
      reason: 'INAPPROPRIATE_CONTENT',
      status: 'PENDING',
    });

    const res = await reportPOST(
      makeReq({
        targetType: 'MEETUP',
        targetId: MEETUP_1,
        reason: 'INAPPROPRIATE_CONTENT',
      })
    );
    expect(res.status).toBe(201);
    const createArg = mockReport.create.mock.calls[0]?.[0];
    expect(createArg?.data).toEqual({
      reporterId: USER_A,
      targetType: 'MEETUP',
      targetUserId: null,
      targetMeetupId: MEETUP_1,
      reason: 'INAPPROPRIATE_CONTENT',
      details: null,
    });
  });

  it('is idempotent — returns 200 with the existing report and does not create a duplicate', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockReport.findFirst.mockResolvedValueOnce({
      id: 'report-existing',
      reporterId: USER_A,
      targetType: 'USER',
      targetUserId: USER_B,
      status: 'PENDING',
    });

    const res = await reportPOST(
      makeReq({ targetType: 'USER', targetId: USER_B, reason: 'SPAM' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 'report-existing' });
    expect(mockReport.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/reports  (admin list)
// ===========================================================================
describe('GET /api/reports', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await reportGET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin user (allowlist unset)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    const res = await reportGET(makeGetReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 when the user is not in the allowlist', async () => {
    vi.stubEnv('ADMIN_USER_IDS', USER_A);
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    const res = await reportGET(makeGetReq());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the report list for an admin', async () => {
    vi.stubEnv('ADMIN_USER_IDS', USER_A);
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const rows = [
      { id: 'r1', status: 'PENDING' },
      { id: 'r2', status: 'REVIEWED' },
    ];
    mockReport.findMany.mockResolvedValueOnce(rows);

    const res = await reportGET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mockReport.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('applies a valid ?status= filter', async () => {
    vi.stubEnv('ADMIN_USER_IDS', `${USER_A},other-admin`);
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockReport.findMany.mockResolvedValueOnce([{ id: 'r1', status: 'PENDING' }]);

    const res = await reportGET(makeGetReq('?status=PENDING'));
    expect(res.status).toBe(200);
    expect(mockReport.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('returns 400 for an invalid ?status= value', async () => {
    vi.stubEnv('ADMIN_USER_IDS', USER_A);
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));

    const res = await reportGET(makeGetReq('?status=BOGUS'));
    expect(res.status).toBe(400);
    expect(mockReport.findMany).not.toHaveBeenCalled();
  });
});
