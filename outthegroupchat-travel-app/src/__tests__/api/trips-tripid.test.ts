/**
 * Unit tests for GET /api/trips/[tripId]
 *              PATCH /api/trips/[tripId]
 *              DELETE /api/trips/[tripId]
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth) are mocked via setup.ts.
 * - Each test sets up its own mocks using mockResolvedValueOnce to prevent
 *   state from leaking between tests.
 * - Static imports only — no top-level await import().
 *
 * GET access logic (from route):
 *   hasAccess = trip.isPublic || (session?.user?.id && (
 *     trip.ownerId === session.user.id || trip.members.some(m => m.userId === session.user.id)
 *   ))
 *   If !hasAccess → 401 (not 403)
 *
 * PATCH auth flow: no session → 401; no OWNER/ADMIN membership → 403; bad body → 400; success → 200
 * DELETE auth flow: no session → 401; isTripOwner (trip.findFirst) returns null → 403; success → 200
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { GET, PATCH, DELETE } from '@/app/api/trips/[tripId]/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const OTHER_USER_ID = 'clh7nz5vr0002mg0hb9gkfxe2';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Trip Owner', email: 'owner@example.com' },
  expires: '2099-01-01',
};

const MOCK_OTHER_SESSION = {
  user: { id: OTHER_USER_ID, name: 'Other User', email: 'other@example.com' },
  expires: '2099-01-01',
};

/** A full trip object as returned by prisma.trip.findUnique with includes. */
const MOCK_TRIP_PRIVATE = {
  id: MOCK_TRIP_ID,
  title: 'Paris Adventure',
  description: 'A trip to Paris',
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-14'),
  status: 'PLANNING',
  isPublic: false,
  ownerId: MOCK_USER_ID,
  viewCount: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  owner: {
    id: MOCK_USER_ID,
    name: 'Trip Owner',
    email: 'owner@example.com',
    image: null,
  },
  members: [
    {
      id: 'member-row-001',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'OWNER',
      joinedAt: new Date('2026-01-01'),
      user: {
        id: MOCK_USER_ID,
        name: 'Trip Owner',
        email: 'owner@example.com',
        image: null,
        city: 'New York',
      },
    },
  ],
  activities: [],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 0 },
};

const MOCK_TRIP_PUBLIC = {
  ...MOCK_TRIP_PRIVATE,
  isPublic: true,
  members: [], // no members — still accessible due to isPublic
};

/** A minimal trip object returned by prisma.trip.update. */
const MOCK_UPDATED_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Paris Adventure Updated',
  description: 'Updated description',
  ownerId: MOCK_USER_ID,
  owner: { id: MOCK_USER_ID, name: 'Trip Owner', image: null },
  members: [],
};

/** Membership row for an OWNER/ADMIN-level user (used in PATCH checks). */
const MOCK_ADMIN_MEMBERSHIP = {
  id: 'member-row-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  joinedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
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

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Clear all mocks before every test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]
// ===========================================================================
describe('GET /api/trips/[tripId]', () => {
  async function callGet(
    tripId: string,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`);
    return GET(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when trip is private and user is not authenticated', async () => {
    // Trip exists and is private; no session → hasAccess is false → 401
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_PRIVATE as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 200 with trip data when user is a member of a private trip', async () => {
    // Trip has the requesting user in members → hasAccess is true
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_PRIVATE as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
    expect(body.data.title).toBe('Paris Adventure');
  });

  it('returns 200 with trip data for a public trip with no session', async () => {
    // isPublic = true → hasAccess regardless of session
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_PUBLIC as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    // For public trips viewed by non-owner, viewCount is incremented
    mockPrismaTrip.update.mockResolvedValueOnce(
      MOCK_TRIP_PUBLIC as unknown as Awaited<ReturnType<typeof prisma.trip.update>>
    );

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
  });

  it('returns 404 when trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
  });

  it('returns 401 when user is authenticated but is not a member of a private trip', async () => {
    // Trip is private; authenticated user (OTHER_USER_ID) is not in members and is not owner
    const tripWithNoOtherUser = {
      ...MOCK_TRIP_PRIVATE,
      ownerId: MOCK_USER_ID,        // owner is MOCK_USER_ID
      members: [
        {
          ...MOCK_TRIP_PRIVATE.members[0],
          userId: MOCK_USER_ID,
        },
      ],
    };

    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      tripWithNoOtherUser as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    // OTHER_USER_ID is authenticated but not in members and not owner
    const res = await callGet(MOCK_TRIP_ID, MOCK_OTHER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('calls prisma.trip.findUnique with the correct tripId', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_PRIVATE as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    await callGet(MOCK_TRIP_ID);

    expect(mockPrismaTrip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_TRIP_ID } })
    );
  });
});

// ===========================================================================
// PATCH /api/trips/[tripId]
// ===========================================================================
describe('PATCH /api/trips/[tripId]', () => {
  async function callPatch(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`, { method: 'PATCH', body });
    return PATCH(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPatch(MOCK_TRIP_ID, { title: 'New Title' }, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('updates trip title and description successfully (200) when user is admin', async () => {
    // Membership check: user has OWNER role
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_ADMIN_MEMBERSHIP as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // Trip update succeeds
    mockPrismaTrip.update.mockResolvedValueOnce(
      MOCK_UPDATED_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.update>>
    );

    const res = await callPatch(MOCK_TRIP_ID, {
      title: 'Paris Adventure Updated',
      description: 'Updated description',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Paris Adventure Updated');
  });

  it('returns 400 on invalid Zod input (empty title string)', async () => {
    // Membership check passes first
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_ADMIN_MEMBERSHIP as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );

    // title: '' fails z.string().min(1)
    const res = await callPatch(MOCK_TRIP_ID, { title: '' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 on invalid Zod input (invalid status enum value)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_ADMIN_MEMBERSHIP as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );

    const res = await callPatch(MOCK_TRIP_ID, { status: 'INVALID_STATUS' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 403 when authenticated user has no OWNER/ADMIN membership', async () => {
    // tripMember.findFirst returns null → user is not OWNER or ADMIN
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPatch(MOCK_TRIP_ID, { title: 'New Title' });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to edit this trip');
  });

  it('returns 403 when non-admin (MEMBER role) tries to update', async () => {
    // The route queries with role: { in: ['OWNER', 'ADMIN'] }, so a MEMBER-role
    // user will not be found → findFirst returns null → 403
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPatch(MOCK_TRIP_ID, { title: 'Sneaky Update' }, MOCK_OTHER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 403 when trip does not exist (membership check fails first)', async () => {
    // Even for a non-existent trip, the membership check runs first.
    // With no membership row, the route returns 403 before reaching the update.
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPatch('clh7nz5vr0009mg0hb9gkfxe9', { title: 'Ghost Update' });
    const body = await parseJson(res);

    // Route returns 403 when membership not found regardless of trip existence
    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('calls tripMember.findFirst with OWNER/ADMIN role filter', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_ADMIN_MEMBERSHIP as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockPrismaTrip.update.mockResolvedValueOnce(
      MOCK_UPDATED_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.update>>
    );

    await callPatch(MOCK_TRIP_ID, { title: 'New Title' });

    expect(mockPrismaTripMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripId: MOCK_TRIP_ID,
          userId: MOCK_USER_ID,
          role: { in: ['OWNER', 'ADMIN'] },
        }),
      })
    );
  });
});

// ===========================================================================
// DELETE /api/trips/[tripId]
// ===========================================================================
describe('DELETE /api/trips/[tripId]', () => {
  async function callDelete(
    tripId: string,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`, { method: 'DELETE' });
    return DELETE(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callDelete(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.findFirst).not.toHaveBeenCalled();
  });

  it('deletes trip successfully (200) when user is the owner', async () => {
    // isTripOwner → prisma.trip.findFirst returns the trip (user is owner)
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: MOCK_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    // prisma.trip.delete returns the deleted trip
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    const res = await callDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Trip deleted successfully');
  });

  it('returns 403 when authenticated user is not the owner', async () => {
    // isTripOwner → prisma.trip.findFirst returns null (other user is not owner)
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callDelete(MOCK_TRIP_ID, MOCK_OTHER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Only the trip owner can delete this trip');
  });

  it('returns 403 when trip does not exist (isTripOwner returns false)', async () => {
    // Trip not found → trip.findFirst returns null → isOwner is false → 403
    // (Route has no separate 404 path for DELETE)
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callDelete('clh7nz5vr0009mg0hb9gkfxe9');
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Only the trip owner can delete this trip');
  });

  it('calls prisma.trip.delete with the correct tripId after owner check passes', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: MOCK_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    await callDelete(MOCK_TRIP_ID);

    expect(mockPrismaTrip.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_TRIP_ID } })
    );
  });

  it('calls isTripOwner with the correct tripId and userId', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: MOCK_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    await callDelete(MOCK_TRIP_ID);

    expect(mockPrismaTrip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MOCK_TRIP_ID,
          ownerId: MOCK_USER_ID,
        }),
      })
    );
  });
});
