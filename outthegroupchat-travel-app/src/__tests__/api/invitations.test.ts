/**
 * Unit tests for the Invitations API route handlers.
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts so no real I/O occurs.
 * - Handlers are called directly with minimal Request objects built from the
 *   standard web-platform Request / URL APIs available in the Vitest node env.
 * - Each describe block maps to a single HTTP verb + route combination.
 *
 * Note on mock shape
 * ------------------
 * setup.ts mocks prisma.tripInvitation with { findFirst, create, update }.
 * The invitations routes additionally call findMany, findUnique, and updateMany.
 * Those methods are attached to the mock object in the module-level
 * augmentation below so they remain under vi.clearAllMocks() control.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Import route handlers under test
// ---------------------------------------------------------------------------
import { GET as invitationsGETBase } from '@/app/api/invitations/route';
// The route signature accepts NextRequest; cast for direct test calls.
const invitationsGET = invitationsGETBase as unknown as (req: NextRequest) => Promise<Response>;
import {
  GET as invitationByIdGET,
  POST as invitationByIdPOST,
} from '@/app/api/invitations/[invitationId]/route';

// ---------------------------------------------------------------------------
// Augment the tripInvitation mock with methods not present in setup.ts.
// The setup mock only defines findFirst / create / update; the routes under
// test also call findMany, findUnique, and updateMany.
// ---------------------------------------------------------------------------
const mockTripInvitation = prisma.tripInvitation as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

if (!mockTripInvitation.findMany) {
  (mockTripInvitation as unknown as Record<string, unknown>).findMany = vi.fn();
}
if (!mockTripInvitation.findUnique) {
  (mockTripInvitation as unknown as Record<string, unknown>).findUnique = vi.fn();
}
if (!mockTripInvitation.updateMany) {
  (mockTripInvitation as unknown as Record<string, unknown>).updateMany = vi.fn();
}

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);
const mockPrismaNotification = vi.mocked(prisma.notification);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-inv-001';
const MOCK_OTHER_USER_ID = 'user-other-002';
const MOCK_TRIP_ID = 'trip-inv-abc';
const MOCK_INVITATION_ID = 'inv-xyz-123';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Invite Tester',
    email: 'tester@example.com',
  },
  expires: '2099-01-01',
};

const FUTURE_DATE = new Date('2099-12-31T00:00:00.000Z');
const PAST_DATE = new Date('2020-01-01T00:00:00.000Z');

/** A minimal tripInvitation row as Prisma would return from findMany. */
const MOCK_INVITATION_LIST_ITEM = {
  id: MOCK_INVITATION_ID,
  userId: MOCK_USER_ID,
  tripId: MOCK_TRIP_ID,
  status: 'PENDING',
  expiresAt: FUTURE_DATE,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  trip: {
    id: MOCK_TRIP_ID,
    title: 'Summer Escape',
    destination: { city: 'Rome', country: 'Italy' },
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-10'),
    isPublic: false,
    ownerId: MOCK_OTHER_USER_ID,
    owner: { id: MOCK_OTHER_USER_ID, name: 'Trip Owner', image: null },
    _count: { members: 3 },
  },
};

/** A minimal tripInvitation row as Prisma would return from findUnique. */
const MOCK_INVITATION_DETAIL = {
  id: MOCK_INVITATION_ID,
  userId: MOCK_USER_ID,
  tripId: MOCK_TRIP_ID,
  status: 'PENDING',
  expiresAt: FUTURE_DATE,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  trip: {
    id: MOCK_TRIP_ID,
    title: 'Summer Escape',
    destination: { city: 'Rome', country: 'Italy' },
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-10'),
    isPublic: false,
    ownerId: MOCK_OTHER_USER_ID,
    owner: { id: MOCK_OTHER_USER_ID, name: 'Trip Owner', image: null },
    members: [
      {
        userId: MOCK_OTHER_USER_ID,
        role: 'OWNER',
        user: { id: MOCK_OTHER_USER_ID, name: 'Trip Owner', image: null },
      },
    ],
    _count: { members: 1, activities: 0 },
  },
};

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return new NextRequest(url, {
    method: options.method ?? 'GET',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    headers,
  });
}

/** Parse JSON body from a NextResponse-like Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/invitations
// ===========================================================================
describe('GET /api/invitations', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockTripInvitation.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with the user invitations when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([MOCK_INVITATION_LIST_ITEM]);
    // No expired invitations — updateMany should not be called
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MOCK_INVITATION_ID);
  });

  it('returns an empty array when the user has no invitations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([]);

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('marks expired PENDING invitations as EXPIRED in the response', async () => {
    const expiredInvitation = {
      ...MOCK_INVITATION_LIST_ITEM,
      status: 'PENDING',
      expiresAt: PAST_DATE, // already expired
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([expiredInvitation]);
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The route rewrites status to EXPIRED for expired invitations
    expect(body.data[0].status).toBe('EXPIRED');
    expect(mockTripInvitation.updateMany).toHaveBeenCalledOnce();
  });

  it('does not call updateMany when there are no expired invitations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([MOCK_INVITATION_LIST_ITEM]);

    const req = makeRequest('/api/invitations');
    await invitationsGET(req);

    expect(mockTripInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('passes the authenticated userId to the Prisma where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([]);

    const req = makeRequest('/api/invitations');
    await invitationsGET(req);

    const callArgs = mockTripInvitation.findMany.mock.calls[0][0];
    expect(callArgs?.where?.userId).toBe(MOCK_USER_ID);
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch invitations');
  });
});

// ===========================================================================
// GET /api/invitations/[invitationId]
// ===========================================================================
describe('GET /api/invitations/[invitationId]', () => {
  async function callGet(invitationId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/invitations/${invitationId}`);
    return invitationByIdGET(req, { params: { invitationId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callGet(MOCK_INVITATION_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockTripInvitation.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the invitation does not exist', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invitation not found');
  });

  it('returns 403 when the invitation belongs to a different user', async () => {
    const otherUserInvitation = { ...MOCK_INVITATION_DETAIL, userId: MOCK_OTHER_USER_ID };
    mockTripInvitation.findUnique.mockResolvedValueOnce(otherUserInvitation);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('This invitation is not for you');
  });

  it('returns 200 with full invitation details when authenticated', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_INVITATION_ID);
    expect(body.data.trip).toBeDefined();
  });

  it('returns 500 when Prisma throws', async () => {
    mockTripInvitation.findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch invitation');
  });
});

// ===========================================================================
// POST /api/invitations/[invitationId]  — accept / decline
// ===========================================================================
describe('POST /api/invitations/[invitationId]', () => {
  async function callPost(
    invitationId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/invitations/${invitationId}`, {
      method: 'POST',
      body,
    });
    return invitationByIdPOST(req, { params: { invitationId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' }, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockTripInvitation.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the invitation does not exist', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invitation not found');
  });

  it('returns 403 when the invitation belongs to a different user', async () => {
    const otherUserInvitation = {
      ...MOCK_INVITATION_DETAIL,
      userId: MOCK_OTHER_USER_ID,
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(otherUserInvitation);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('This invitation is not for you');
  });

  it('returns 400 when the invitation has already been responded to (ACCEPTED)', async () => {
    const acceptedInvitation = {
      ...MOCK_INVITATION_DETAIL,
      status: 'ACCEPTED',
      expiresAt: FUTURE_DATE,
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(acceptedInvitation);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already been/i);
  });

  it('returns 400 when the invitation has expired', async () => {
    const expiredInvitation = {
      ...MOCK_INVITATION_DETAIL,
      status: 'PENDING',
      expiresAt: PAST_DATE,
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(expiredInvitation);
    mockTripInvitation.update.mockResolvedValueOnce({ ...expiredInvitation, status: 'EXPIRED' });

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invitation has expired');
    // The route marks it as EXPIRED in the DB
    expect(mockTripInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } })
    );
  });

  it('returns 400 when the action field is invalid', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'maybe' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when the body is missing the action field', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);

    const res = await callPost(MOCK_INVITATION_ID, {});
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('accepts the invitation, creates a trip member, and sends a notification', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_DETAIL,
      status: 'ACCEPTED',
    });
    mockPrismaTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockPrismaNotification.create.mockResolvedValueOnce(
      { id: 'notif-1' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Invitation accepted');
    expect(body.data.tripId).toBe(MOCK_TRIP_ID);

    expect(mockTripInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } })
    );
    expect(mockPrismaTripMember.create).toHaveBeenCalledOnce();
    expect(mockPrismaNotification.create).toHaveBeenCalledOnce();
  });

  it('accepts the invitation with optional budgetRange and departureCity', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_DETAIL,
      status: 'ACCEPTED',
    });
    mockPrismaTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
      budgetRange: { min: 500, max: 2000, currency: 'USD' },
      departureCity: 'New York',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockPrismaNotification.create.mockResolvedValueOnce(
      { id: 'notif-2' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    const res = await callPost(MOCK_INVITATION_ID, {
      action: 'accept',
      budgetRange: { min: 500, max: 2000, currency: 'USD' },
      departureCity: 'New York',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Invitation accepted');
  });

  it('declines the invitation and returns 200', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_DETAIL,
      status: 'DECLINED',
    });

    const res = await callPost(MOCK_INVITATION_ID, { action: 'decline' });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Invitation declined');

    expect(mockTripInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DECLINED' } })
    );
    // Declining should NOT create a trip member or send a notification
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws during findUnique', async () => {
    mockTripInvitation.findUnique.mockRejectedValueOnce(new Error('DB error'));

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to respond to invitation');
  });

  it('returns 500 when Prisma throws during accept update', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_DETAIL);
    mockTripInvitation.update.mockRejectedValueOnce(new Error('Update failed'));

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to respond to invitation');
  });
});
