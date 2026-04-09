/**
 * Integration-style tests for the trip collaboration flow:
 * create trip → add members → manage members → check permissions.
 *
 * These tests call API route handlers directly with mocked Prisma/auth.
 * All external dependencies are mocked via setup.ts (Prisma, NextAuth, logger,
 * invitations). Each test sets up its own mocks with mockResolvedValueOnce to
 * prevent state leakage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { TripStatus, TripMemberRole } from '@prisma/client';

// Mock rate-limit before any route imports to prevent live Redis calls
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
  authRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Route handlers under test
import { POST as tripsPost, GET as tripsGet } from '@/app/api/trips/route';
import {
  GET as tripByIdGet,
} from '@/app/api/trips/[tripId]/route';
import {
  POST as membersPost,
  GET as membersGet,
  DELETE as membersDelete,
  PATCH as membersPatch,
} from '@/app/api/trips/[tripId]/members/route';

// ---------------------------------------------------------------------------
// Typed references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockPrismaUser = vi.mocked(prisma.user) as typeof prisma.user & {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_OWNER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_MEMBER_ID_ROW = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_NEW_USER_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_MEMBER_ROW_ID = 'clh7nz5vr0004mg0hb9gkfxe4';
const MOCK_TARGET_MEMBER_ROW_ID = 'clh7nz5vr0005mg0hb9gkfxe5';

const OWNER_SESSION = {
  user: { id: MOCK_OWNER_ID, name: 'Trip Owner', email: 'owner@example.com' },
  expires: '2099-01-01',
};

const MEMBER_SESSION = {
  user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Beach Getaway',
  description: 'Fun in the sun',
  destination: { city: 'Miami', country: 'USA' },
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-07-10'),
  isPublic: false,
  ownerId: MOCK_OWNER_ID,
  status: 'PLANNING' as TripStatus,
  viewCount: 0,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  owner: { id: MOCK_OWNER_ID, name: 'Trip Owner', image: null },
  members: [{ id: MOCK_MEMBER_ID_ROW, userId: MOCK_OWNER_ID, role: 'OWNER' as TripMemberRole, user: { id: MOCK_OWNER_ID, name: 'Trip Owner', image: null } }],
  activities: [],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 0 },
};

const MOCK_OWNER_MEMBER_ROW = {
  id: MOCK_MEMBER_ID_ROW,
  tripId: MOCK_TRIP_ID,
  userId: MOCK_OWNER_ID,
  role: 'OWNER' as TripMemberRole,
  joinedAt: new Date('2026-01-01'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

const MOCK_REGULAR_MEMBER_ROW = {
  id: MOCK_MEMBER_ROW_ID,
  tripId: MOCK_TRIP_ID,
  userId: MOCK_NEW_USER_ID,
  role: 'MEMBER' as TripMemberRole,
  joinedAt: new Date('2026-02-01'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

const VALID_TRIP_BODY = {
  title: 'Beach Getaway',
  description: 'Fun in the sun',
  destination: { city: 'Miami', country: 'USA' },
  startDate: '2026-07-01',
  endDate: '2026-07-10',
  isPublic: false,
  memberEmails: [],
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
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// SECTION 1: Trip Creation (POST /api/trips)
// ===========================================================================
describe('Trip Collaboration: Trip Creation', () => {
  it('owner can create a trip with valid data — returns 201', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockPrismaTrip.create.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.create>>
    );

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_TRIP_BODY });
    const res = await tripsPost(req);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
    expect(body.data.ownerId).toBe(MOCK_OWNER_ID);
    expect(mockPrismaTrip.create).toHaveBeenCalledOnce();
  });

  it('non-authenticated user cannot create a trip — returns 401', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_TRIP_BODY });
    const res = await tripsPost(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.create).not.toHaveBeenCalled();
  });

  it('trip creation sets ownerId to the authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockPrismaTrip.create.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.create>>
    );

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_TRIP_BODY });
    await tripsPost(req);

    const createArgs = mockPrismaTrip.create.mock.calls[0][0];
    expect(createArgs?.data?.ownerId).toBe(MOCK_OWNER_ID);
  });

  it('trip creation rejects missing title — returns 400', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);

    const invalidBody = { ...VALID_TRIP_BODY, title: '' };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPost(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTrip.create).not.toHaveBeenCalled();
  });

  it('rate limited trip creation returns 429', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_TRIP_BODY });
    const res = await tripsPost(req);

    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// SECTION 2: Trip Access / Visibility (GET /api/trips/[tripId])
// ===========================================================================
describe('Trip Collaboration: Trip Access', () => {
  async function callGetTrip(tripId: string, session: unknown = OWNER_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`);
    return tripByIdGet(req, { params: Promise.resolve({ tripId }) });
  }

  it('owner can view their own trip — returns 200', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const res = await callGetTrip(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
  });

  it('member can view a trip they belong to — returns 200', async () => {
    const tripWithMember = {
      ...MOCK_TRIP,
      members: [
        ...MOCK_TRIP.members,
        { id: MOCK_MEMBER_ROW_ID, userId: MOCK_NEW_USER_ID, role: 'MEMBER' as TripMemberRole, user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', image: null } },
      ],
    };
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      tripWithMember as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('non-member cannot view a private trip — returns 401', async () => {
    const privateTrip = {
      ...MOCK_TRIP,
      isPublic: false,
      ownerId: 'some-other-owner',
      members: [],
    };
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      privateTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('unauthenticated user cannot view a private trip — returns 401', async () => {
    const privateTrip = { ...MOCK_TRIP, isPublic: false, members: [] };
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      privateTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('public trip is accessible without authentication — returns 200', async () => {
    const publicTrip = {
      ...MOCK_TRIP,
      isPublic: true,
      ownerId: 'some-other-owner',
      members: [],
    };
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      publicTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    // view count increment call
    mockPrismaTrip.update.mockResolvedValueOnce(
      publicTrip as unknown as Awaited<ReturnType<typeof prisma.trip.update>>
    );

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 for a non-existent trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest('/api/trips/nonexistent-id');
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: 'nonexistent-id' }) });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
  });

  it('rate limited trip access returns 429', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGet(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });

    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// SECTION 3: Member Management (POST /api/trips/[tripId]/members)
// ===========================================================================
describe('Trip Collaboration: Adding Members', () => {
  async function callAddMember(
    tripId: string,
    body: unknown,
    session: unknown = OWNER_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`, { method: 'POST', body });
    return membersPost(req, { params: { tripId } });
  }

  it('owner can add a member by userId — returns 201', async () => {
    // First findFirst: requesting member check (owner)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // Second findFirst: existing member check (not a member yet)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    // create: new member row
    const newMemberRow = {
      ...MOCK_REGULAR_MEMBER_ROW,
      user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null },
    };
    mockPrismaTripMember.create.mockResolvedValueOnce(
      newMemberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callAddMember(MOCK_TRIP_ID, { userId: MOCK_NEW_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(MOCK_NEW_USER_ID);
    expect(mockPrismaTripMember.create).toHaveBeenCalledOnce();
  });

  it('owner can add a member by email — returns 201', async () => {
    // requesting member check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // user lookup by email
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    // existing member check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    // create
    const newMemberRow = {
      ...MOCK_REGULAR_MEMBER_ROW,
      user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null },
    };
    mockPrismaTripMember.create.mockResolvedValueOnce(
      newMemberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callAddMember(MOCK_TRIP_ID, { email: 'member@example.com' });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('regular member cannot add other members — returns 403', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );

    const res = await callAddMember(MOCK_TRIP_ID, { userId: 'some-new-user' }, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('non-member cannot add members — returns 403', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callAddMember(MOCK_TRIP_ID, { userId: 'some-new-user' }, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('unauthenticated user cannot add members — returns 401', async () => {
    const res = await callAddMember(MOCK_TRIP_ID, { userId: MOCK_NEW_USER_ID }, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('cannot add an already-existing member — returns 409', async () => {
    // requesting member: owner
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // existing member check: user is already a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );

    const res = await callAddMember(MOCK_TRIP_ID, { userId: MOCK_NEW_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User is already a member of this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('adding member by email with unknown email — returns 404', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);

    const res = await callAddMember(MOCK_TRIP_ID, { email: 'unknown@example.com' });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User not found');
  });

  it('adding member with neither userId nor email — returns 400', async () => {
    const res = await callAddMember(MOCK_TRIP_ID, { role: 'MEMBER' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('admin can also add members — returns 201', async () => {
    const adminMemberRow = { ...MOCK_OWNER_MEMBER_ROW, userId: MOCK_NEW_USER_ID, role: 'ADMIN' as TripMemberRole };
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // requesting member: admin
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      adminMemberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // existing member check: not yet a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    const newMemberRow = {
      id: 'clh7nz5vr0006mg0hb9gkfxe6',
      tripId: MOCK_TRIP_ID,
      userId: 'clh7nz5vr0007mg0hb9gkfxe7',
      role: 'MEMBER' as TripMemberRole,
      joinedAt: new Date(),
      budgetRange: null,
      departureCity: null,
      flightDetails: null,
      user: { id: 'clh7nz5vr0007mg0hb9gkfxe7', name: 'New Guest', email: 'guest@example.com', image: null },
    };
    mockPrismaTripMember.create.mockResolvedValueOnce(
      newMemberRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/members`, {
      method: 'POST',
      body: { userId: 'clh7nz5vr0007mg0hb9gkfxe7' },
    });
    const res = await membersPost(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// SECTION 4: Viewing Members (GET /api/trips/[tripId]/members)
// ===========================================================================
describe('Trip Collaboration: Viewing Members', () => {
  async function callGetMembers(tripId: string, session: unknown = OWNER_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`);
    return membersGet(req, { params: { tripId } });
  }

  it('authenticated user can view trip members list — returns 200', async () => {
    const membersList = [
      {
        ...MOCK_OWNER_MEMBER_ROW,
        user: { id: MOCK_OWNER_ID, name: 'Trip Owner', email: 'owner@example.com', image: null, city: null, preferences: null },
      },
      {
        ...MOCK_REGULAR_MEMBER_ROW,
        user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null, city: null, preferences: null },
      },
    ];
    mockPrismaTripMember.findMany.mockResolvedValueOnce(
      membersList as unknown as Awaited<ReturnType<typeof prisma.tripMember.findMany>>
    );

    const res = await callGetMembers(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].userId).toBe(MOCK_OWNER_ID);
    expect(body.data[1].userId).toBe(MOCK_NEW_USER_ID);
  });

  it('member can also view the trip members list — returns 200', async () => {
    const membersList = [
      {
        ...MOCK_REGULAR_MEMBER_ROW,
        user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null, city: null, preferences: null },
      },
    ];
    mockPrismaTripMember.findMany.mockResolvedValueOnce(
      membersList as unknown as Awaited<ReturnType<typeof prisma.tripMember.findMany>>
    );

    const res = await callGetMembers(MOCK_TRIP_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('unauthenticated user cannot view members — returns 401', async () => {
    const res = await callGetMembers(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty list when trip has no members', async () => {
    mockPrismaTripMember.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.tripMember.findMany>>
    );

    const res = await callGetMembers(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// SECTION 5: Removing Members (DELETE /api/trips/[tripId]/members)
// ===========================================================================
describe('Trip Collaboration: Removing Members', () => {
  async function callDeleteMember(
    tripId: string,
    memberId: string,
    session: unknown = OWNER_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(
      `/api/trips/${tripId}/members?memberId=${memberId}`,
      { method: 'DELETE' }
    );
    return membersDelete(req, { params: { tripId } });
  }

  it('owner can remove a regular member — returns 200', async () => {
    // requesting member: owner
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target member to remove
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_MEMBER_ROW_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(mockPrismaTripMember.delete).toHaveBeenCalledWith({ where: { id: MOCK_MEMBER_ROW_ID } });
  });

  it('unauthenticated user cannot remove a member — returns 401', async () => {
    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_MEMBER_ROW_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('non-member cannot remove members — returns 403', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_TARGET_MEMBER_ROW_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('cannot remove the trip owner — returns 400', async () => {
    // requesting member: owner
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target: also owner role
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );

    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_MEMBER_ID_ROW);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot remove the trip owner');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when memberId query param is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/members`, { method: 'DELETE' });
    const res = await membersDelete(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member ID required');
  });

  it('member can remove themselves from the trip — returns 200', async () => {
    // requesting member: regular member (removing self)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target member: same user
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_MEMBER_ROW_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('regular member cannot remove other members — returns 403', async () => {
    // requesting member: regular member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target: a different member (not self)
    const otherMember = {
      ...MOCK_OWNER_MEMBER_ROW,
      id: MOCK_TARGET_MEMBER_ROW_ID,
      userId: 'clh7nz5vr0008mg0hb9gkfxe8',
      role: 'MEMBER' as TripMemberRole,
    };
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      otherMember as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );

    const res = await callDeleteMember(MOCK_TRIP_ID, MOCK_TARGET_MEMBER_ROW_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SECTION 6: Updating Member Details (PATCH /api/trips/[tripId]/members)
// ===========================================================================
describe('Trip Collaboration: Updating Member Details', () => {
  async function callPatchMember(
    tripId: string,
    body: unknown,
    session: unknown = OWNER_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`, { method: 'PATCH', body });
    return membersPatch(req, { params: { tripId } });
  }

  it('owner can promote a member to admin — returns 200', async () => {
    // requesting member: owner
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target member
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );
    const updatedRow = {
      ...MOCK_REGULAR_MEMBER_ROW,
      role: 'ADMIN' as TripMemberRole,
      user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null },
    };
    mockPrismaTripMember.update.mockResolvedValueOnce(
      updatedRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.update>>
    );

    const res = await callPatchMember(MOCK_TRIP_ID, { memberId: MOCK_MEMBER_ROW_ID, role: 'ADMIN' });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('ADMIN');
  });

  it('regular member cannot change another member role — returns 403', async () => {
    // requesting member: regular member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target member: the owner
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_OWNER_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );

    const res = await callPatchMember(
      MOCK_TRIP_ID,
      { memberId: MOCK_MEMBER_ID_ROW, role: 'ADMIN' },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('member can update their own departure city — returns 200', async () => {
    // requesting member: the same regular member updating self
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // target: same member row (self update)
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(
      MOCK_REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.findUnique>>
    );
    const updatedRow = {
      ...MOCK_REGULAR_MEMBER_ROW,
      departureCity: 'Chicago',
      user: { id: MOCK_NEW_USER_ID, name: 'Trip Member', email: 'member@example.com', image: null },
    };
    mockPrismaTripMember.update.mockResolvedValueOnce(
      updatedRow as unknown as Awaited<ReturnType<typeof prisma.tripMember.update>>
    );

    const res = await callPatchMember(
      MOCK_TRIP_ID,
      { memberId: MOCK_MEMBER_ROW_ID, departureCity: 'Chicago' },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.departureCity).toBe('Chicago');
  });

  it('unauthenticated user cannot update member details — returns 401', async () => {
    const res = await callPatchMember(
      MOCK_TRIP_ID,
      { memberId: MOCK_MEMBER_ROW_ID, role: 'ADMIN' },
      null
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });
});
