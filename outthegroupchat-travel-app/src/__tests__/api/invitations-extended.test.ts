/**
 * Extended unit tests for invitation-related API route handlers.
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, processInvitations)
 *   are mocked via src/__tests__/setup.ts so no real I/O occurs.
 * - Each test sets up its own mocks with mockResolvedValueOnce() to prevent
 *   state from leaking between tests.
 * - vi.clearAllMocks() is called in beforeEach.
 * - NextRequest is used for routes that need header access.
 *
 * Coverage scope
 * --------------
 * - GET  /api/invitations  — additional edge cases not in invitations.test.ts
 * - POST /api/invitations  — additional edge cases not in invitations-post.test.ts
 * - GET  /api/invitations/[invitationId]  — additional coverage
 * - POST /api/invitations/[invitationId]  — TripMember args, notification
 *     content, accept/decline branching
 * - GET  /api/trips/[tripId]/invitations  — additional edge cases
 * - POST /api/trips/[tripId]/invitations  — additional edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { processInvitations } from '@/lib/invitations';

// ---------------------------------------------------------------------------
// Static imports for route handlers under test
// ---------------------------------------------------------------------------
import { GET as invitationsGETBase, POST as invitationsPOST } from '@/app/api/invitations/route';
const invitationsGET = invitationsGETBase as unknown as (req: Request) => Promise<Response>;

import {
  GET as invitationByIdGET,
  POST as invitationByIdPOST,
} from '@/app/api/invitations/[invitationId]/route';

import {
  GET as tripInvitationsGET,
  POST as tripInvitationsPOST,
} from '@/app/api/trips/[tripId]/invitations/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockProcessInvitations = vi.mocked(processInvitations);

const mockTripInvitation = prisma.tripInvitation as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

const mockTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const mockTrip = prisma.trip as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

const mockNotification = prisma.notification as unknown as {
  create: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-ext-inv-001';
const MOCK_OTHER_USER_ID = 'user-ext-inv-002';
const MOCK_TRIP_ID = 'trip-ext-inv-001';
const MOCK_INVITATION_ID = 'inv-ext-001';

const FUTURE_DATE = new Date('2099-12-31T00:00:00.000Z');
const PAST_DATE = new Date('2020-01-01T00:00:00.000Z');

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Extended Tester', email: 'ext@example.com' },
  expires: '2099-01-01',
};

/** A PENDING invitation that has NOT expired. */
const MOCK_INVITATION_PENDING = {
  id: MOCK_INVITATION_ID,
  userId: MOCK_USER_ID,
  tripId: MOCK_TRIP_ID,
  status: 'PENDING',
  expiresAt: FUTURE_DATE,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
  trip: {
    id: MOCK_TRIP_ID,
    title: 'Paris Adventure',
    destination: { city: 'Paris', country: 'France' },
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-10'),
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
    _count: { members: 1, activities: 2 },
  },
};

/** Minimal helper to build a plain Request. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

/** Minimal helper to build a NextRequest. */
function makeNextRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? 'GET',
    ...(options.body !== undefined
      ? {
          body: JSON.stringify(options.body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
}

async function json(res: Response) {
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/invitations — additional edge cases
// ===========================================================================
describe('GET /api/invitations — extended', () => {
  it('returns 401 when session user has no id field', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No ID User' },
      expires: '2099-01-01',
    } as never);

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await json(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('does not update expired non-PENDING invitations (ACCEPTED, DECLINED, EXPIRED)', async () => {
    const acceptedInvitation = {
      id: 'inv-accepted',
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      status: 'ACCEPTED',
      expiresAt: PAST_DATE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      trip: {
        id: MOCK_TRIP_ID,
        title: 'Completed Trip',
        isPublic: false,
        ownerId: MOCK_OTHER_USER_ID,
        owner: { id: MOCK_OTHER_USER_ID, name: 'Owner', image: null },
        _count: { members: 2 },
      },
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([acceptedInvitation]);

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // ACCEPTED invitation past expiry should not trigger updateMany
    expect(mockTripInvitation.updateMany).not.toHaveBeenCalled();
    // Status stays as ACCEPTED (not rewritten to EXPIRED)
    expect(body.data[0].status).toBe('ACCEPTED');
  });

  it('marks multiple expired PENDING invitations as EXPIRED in one updateMany call', async () => {
    const makeExpired = (id: string) => ({
      id,
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      status: 'PENDING',
      expiresAt: PAST_DATE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      trip: {
        id: MOCK_TRIP_ID,
        title: 'Old Trip',
        isPublic: false,
        ownerId: MOCK_OTHER_USER_ID,
        owner: { id: MOCK_OTHER_USER_ID, name: 'Owner', image: null },
        _count: { members: 1 },
      },
    });

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([
      makeExpired('inv-exp-1'),
      makeExpired('inv-exp-2'),
      makeExpired('inv-exp-3'),
    ]);
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 3 });

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockTripInvitation.updateMany).toHaveBeenCalledOnce();
    expect(mockTripInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['inv-exp-1', 'inv-exp-2', 'inv-exp-3'] } },
        data: { status: 'EXPIRED' },
      })
    );
    body.data.forEach((inv: { status: string }) => {
      expect(inv.status).toBe('EXPIRED');
    });
  });

  it('returns data in descending createdAt order as provided by Prisma', async () => {
    const older = {
      ...MOCK_INVITATION_PENDING,
      id: 'inv-older',
      createdAt: new Date('2026-01-01'),
    };
    const newer = {
      ...MOCK_INVITATION_PENDING,
      id: 'inv-newer',
      createdAt: new Date('2026-03-01'),
    };

    // Prisma returns them newest-first (route just passes through)
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([newer, older]);

    const req = makeRequest('/api/invitations');
    const res = await invitationsGET(req);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data[0].id).toBe('inv-newer');
    expect(body.data[1].id).toBe('inv-older');
  });

  it('queries invitations using orderBy createdAt desc', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripInvitation.findMany.mockResolvedValueOnce([]);

    const req = makeRequest('/api/invitations');
    await invitationsGET(req);

    expect(mockTripInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });
});

// ===========================================================================
// POST /api/invitations — additional edge cases
// ===========================================================================
describe('POST /api/invitations — extended', () => {
  it('returns 400 when expirationHours is a float (non-integer)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { tripId: MOCK_TRIP_ID, emails: ['friend@example.com'], expirationHours: 2.5 },
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when emails contains a non-string value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { tripId: MOCK_TRIP_ID, emails: [123] },
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when emails field is a string instead of an array', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { tripId: MOCK_TRIP_ID, emails: 'friend@example.com' },
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 403 when trip exists but user is only a MEMBER (not OWNER/ADMIN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // findFirst with role in [OWNER, ADMIN] returns null
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] },
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('You do not have permission to invite members to this trip');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('includes validation details object in 400 response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { emails: ['valid@example.com'] }, // missing tripId
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.details).toHaveProperty('fieldErrors');
  });

  it('returns 200 with success:true and data property on valid request', async () => {
    const processResult = {
      invitations: [{ email: 'a@example.com', status: 'invited', message: 'sent' }],
      errors: [],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'OWNER',
      trip: { title: 'Paris Trip', ownerId: MOCK_USER_ID },
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockProcessInvitations.mockResolvedValueOnce(processResult);

    const req = makeNextRequest('/api/invitations', {
      method: 'POST',
      body: { tripId: MOCK_TRIP_ID, emails: ['a@example.com'] },
    });
    const res = await invitationsPOST(req);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(processResult);
  });
});

// ===========================================================================
// GET /api/invitations/[invitationId] — additional coverage
// ===========================================================================
describe('GET /api/invitations/[invitationId] — extended', () => {
  async function callGet(invitationId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/invitations/${invitationId}`);
    return invitationByIdGET(req, { params: { invitationId } });
  }

  it('returns invitation with nested trip members data', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.trip.members).toHaveLength(1);
    expect(body.data.trip.members[0].role).toBe('OWNER');
  });

  it('returns invitation with trip _count for members and activities', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data.trip._count.members).toBe(1);
    expect(body.data.trip._count.activities).toBe(2);
  });

  it('returns 401 when session is null', async () => {
    const res = await callGet(MOCK_INVITATION_ID, null);
    const body = await json(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockTripInvitation.findUnique).not.toHaveBeenCalled();
  });

  it('calls findUnique with the correct invitationId', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);

    await callGet(MOCK_INVITATION_ID);

    expect(mockTripInvitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_INVITATION_ID } })
    );
  });

  it('returns the full invitation object including status and expiresAt', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);

    const res = await callGet(MOCK_INVITATION_ID);
    const body = await json(res);

    expect(body.data.status).toBe('PENDING');
    expect(body.data.expiresAt).toBeDefined();
    expect(body.data.tripId).toBe(MOCK_TRIP_ID);
  });
});

// ===========================================================================
// POST /api/invitations/[invitationId] — accept/decline branching
// ===========================================================================
describe('POST /api/invitations/[invitationId] — extended', () => {
  async function callPost(
    invitationId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/invitations/${invitationId}`, {
      method: 'POST',
      body,
    });
    return invitationByIdPOST(req, { params: { invitationId } });
  }

  it('creates TripMember with correct tripId, userId, and role MEMBER when accepting', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'ACCEPTED',
    });
    mockTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockNotification.create.mockResolvedValueOnce(
      { id: 'notif-1' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await callPost(MOCK_INVITATION_ID, { action: 'accept' });

    expect(mockTripMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: MOCK_TRIP_ID,
          userId: MOCK_USER_ID,
          role: 'MEMBER',
        }),
      })
    );
  });

  it('sends notification to trip owner when accepting', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'ACCEPTED',
    });
    mockTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockNotification.create.mockResolvedValueOnce(
      { id: 'notif-1' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await callPost(MOCK_INVITATION_ID, { action: 'accept' });

    expect(mockNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_OTHER_USER_ID,
          type: 'TRIP_UPDATE',
          title: 'Invitation Accepted',
        }),
      })
    );
  });

  it('passes budgetRange and departureCity to TripMember.create when accepting', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'ACCEPTED',
    });
    mockTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
      budgetRange: { min: 1000, max: 3000, currency: 'EUR' },
      departureCity: 'London',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockNotification.create.mockResolvedValueOnce(
      { id: 'notif-2' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await callPost(MOCK_INVITATION_ID, {
      action: 'accept',
      budgetRange: { min: 1000, max: 3000, currency: 'EUR' },
      departureCity: 'London',
    });

    expect(mockTripMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departureCity: 'London',
          budgetRange: { min: 1000, max: 3000, currency: 'EUR' },
        }),
      })
    );
  });

  it('does not create TripMember when declining invitation', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'DECLINED',
    });

    const res = await callPost(MOCK_INVITATION_ID, { action: 'decline' });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.message).toBe('Invitation declined');
    expect(mockTripMember.create).not.toHaveBeenCalled();
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('updates invitation status to DECLINED on the correct id', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'DECLINED',
    });

    await callPost(MOCK_INVITATION_ID, { action: 'decline' });

    expect(mockTripInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_INVITATION_ID },
        data: { status: 'DECLINED' },
      })
    );
  });

  it('returns 400 with error message "already been declined" for DECLINED invitation', async () => {
    const declinedInvitation = {
      ...MOCK_INVITATION_PENDING,
      status: 'DECLINED',
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(declinedInvitation);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already been declined/i);
  });

  it('returns 400 with error message "already been expired" for EXPIRED invitation', async () => {
    const expiredInvitation = {
      ...MOCK_INVITATION_PENDING,
      status: 'EXPIRED',
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(expiredInvitation);

    const res = await callPost(MOCK_INVITATION_ID, { action: 'decline' });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already been expired/i);
  });

  it('marks invitation as EXPIRED in DB and returns 400 when expiresAt is in the past', async () => {
    const expiredPending = {
      ...MOCK_INVITATION_PENDING,
      status: 'PENDING',
      expiresAt: PAST_DATE,
    };
    mockTripInvitation.findUnique.mockResolvedValueOnce(expiredPending);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...expiredPending,
      status: 'EXPIRED',
    });

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invitation has expired');
    expect(mockTripInvitation.update).toHaveBeenCalledWith({
      where: { id: MOCK_INVITATION_ID },
      data: { status: 'EXPIRED' },
    });
  });

  it('returns tripId in response data when accepting', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'ACCEPTED',
    });
    mockTripMember.create.mockResolvedValueOnce({
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>);
    mockNotification.create.mockResolvedValueOnce(
      { id: 'notif-3' } as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await json(res);

    expect(body.data.tripId).toBe(MOCK_TRIP_ID);
  });

  it('returns 500 when TripMember.create throws during accept', async () => {
    mockTripInvitation.findUnique.mockResolvedValueOnce(MOCK_INVITATION_PENDING);
    mockTripInvitation.update.mockResolvedValueOnce({
      ...MOCK_INVITATION_PENDING,
      status: 'ACCEPTED',
    });
    mockTripMember.create.mockRejectedValueOnce(new Error('Member insert failed'));

    const res = await callPost(MOCK_INVITATION_ID, { action: 'accept' });
    const body = await json(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to respond to invitation');
  });
});

// ===========================================================================
// GET /api/trips/[tripId]/invitations — additional edge cases
// ===========================================================================
describe('GET /api/trips/[tripId]/invitations — extended', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/trips/${tripId}/invitations`);
    return tripInvitationsGET(req, { params: Promise.resolve({ tripId }) });
  }

  it('allows ADMIN members to view invitations', async () => {
    const adminMember = {
      id: 'member-admin-1',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'ADMIN',
    };

    mockTripMember.findFirst.mockResolvedValueOnce(
      adminMember as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockTripInvitation.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns invitations with user field included', async () => {
    const memberRow = {
      id: 'member-ext-1',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    };

    const invitationWithUser = {
      id: 'inv-with-user',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_OTHER_USER_ID,
      status: 'PENDING',
      expiresAt: FUTURE_DATE,
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-01'),
      user: {
        id: MOCK_OTHER_USER_ID,
        name: 'Invited Person',
        email: 'invited@example.com',
        image: null,
      },
    };

    mockTripMember.findFirst.mockResolvedValueOnce(
      memberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockTripInvitation.findMany.mockResolvedValueOnce([invitationWithUser] as never);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data[0].user.email).toBe('invited@example.com');
    expect(body.data[0].user.name).toBe('Invited Person');
  });

  it('returns 403 for OWNER of a different trip who is not a member of this trip', async () => {
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await json(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockTripInvitation.findMany).not.toHaveBeenCalled();
  });

  it('passes include: { user: { select: ... } } to tripInvitation.findMany', async () => {
    const memberRow = {
      id: 'member-ext-2',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'MEMBER',
    };

    mockTripMember.findFirst.mockResolvedValueOnce(
      memberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockTripInvitation.findMany.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    const callArgs = mockTripInvitation.findMany.mock.calls[0][0];
    expect(callArgs).toHaveProperty('include.user');
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/invitations — additional edge cases
// ===========================================================================
describe('POST /api/trips/[tripId]/invitations — extended', () => {
  async function callPost(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/trips/${tripId}/invitations`, {
      method: 'POST',
      body,
    });
    return tripInvitationsPOST(req, { params: Promise.resolve({ tripId }) });
  }

  const VALID_BODY = { emails: ['guest@example.com'], expirationHours: 24 };

  it('returns 200 when user is trip owner even without an ADMIN membership record', async () => {
    // isOwner = true because trip.ownerId === session.user.id
    // membership = null but that is OK for owner
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'Owner Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    mockProcessInvitations.mockResolvedValueOnce({
      invitations: [{ email: 'guest@example.com', status: 'sent' }],
      errors: [],
    });

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockProcessInvitations).toHaveBeenCalledOnce();
  });

  it('returns 403 for a MEMBER of the trip who is not the owner or admin', async () => {
    // Not owner (different ownerId), not admin (findFirst returns null)
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OTHER_USER_ID,
      title: 'Their Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await json(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not authorized to invite members');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('passes the correct inviterName "Someone" when session user.name is an empty string', async () => {
    const sessionEmptyName = {
      user: { id: MOCK_USER_ID, name: '', email: 'empty@example.com' },
      expires: '2099-01-01',
    };

    mockGetServerSession.mockResolvedValueOnce(
      sessionEmptyName as Awaited<ReturnType<typeof getServerSession>>
    );
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'Named Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    mockProcessInvitations.mockResolvedValueOnce({ invitations: [], errors: [] });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/invitations`, {
      method: 'POST',
      body: VALID_BODY,
    });
    await tripInvitationsPOST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });

    // The route uses `session.user.name || 'Someone'`
    // empty string is falsy so falls back to 'Someone'
    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'Someone' })
    );
  });

  it('returns 400 when expirationHours is exactly 0 (below minimum of 1)', async () => {
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'Owner Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { emails: ['a@example.com'], expirationHours: 0 });
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('defaults expirationHours to 24 and passes it to processInvitations', async () => {
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'My Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    mockProcessInvitations.mockResolvedValueOnce({ invitations: [], errors: [] });

    // Send without expirationHours — Zod default kicks in
    const res = await callPost(MOCK_TRIP_ID, { emails: ['b@example.com'] });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ expirationHours: 24 })
    );
  });

  it('returns 500 when processInvitations rejects with an unexpected error', async () => {
    mockTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'Error Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    mockProcessInvitations.mockRejectedValueOnce(new Error('Unexpected crash'));

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await json(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to send invitations');
  });
});
