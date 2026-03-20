/**
 * Unit tests for the Trips API route handlers.
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, invitations) are
 *   mocked in src/__tests__/setup.ts so no real I/O occurs.
 * - Handlers are called directly with a minimal NextRequest-compatible object
 *   built from the standard Request / URL web-platform APIs that Node 18+
 *   exposes in the Vitest node environment.
 * - Each describe block maps to a single HTTP verb + route combination.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { TripStatus, TripMemberRole } from '@prisma/client';

// Import the route handlers under test
import { GET as tripsGET, POST as tripsPOST } from '@/app/api/trips/route';
import {
  GET as tripByIdGET,
  PATCH as tripByIdPATCH,
  DELETE as tripByIdDELETE,
} from '@/app/api/trips/[tripId]/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-abc-123';
const MOCK_TRIP_ID = 'trip-xyz-456';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal trip row as it would be returned by Prisma's findMany/findUnique. */
const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Paris Getaway',
  description: 'A lovely trip to Paris',
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-10'),
  isPublic: false,
  ownerId: MOCK_USER_ID,
  status: 'PLANNING' as TripStatus,
  viewCount: 0,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  owner: { id: MOCK_USER_ID, name: 'Test User', image: null },
  members: [{ userId: MOCK_USER_ID, role: 'OWNER', user: { id: MOCK_USER_ID, name: 'Test User', image: null } }],
  _count: { members: 1, activities: 0 },
};

/** Build a minimal Request object accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
}

/** Parse the JSON body from a NextResponse-like Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips
// ===========================================================================
describe('GET /api/trips', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/trips');
    const res = await tripsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.findMany).not.toHaveBeenCalled();
  });

  it('returns the user trips when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP]);

    const req = makeRequest('/api/trips');
    const res = await tripsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MOCK_TRIP_ID);
  });

  it('passes the userId to the Prisma where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);

    const req = makeRequest('/api/trips');
    await tripsGET(req);

    // The where clause must reference the authenticated user
    const callArgs = mockPrismaTrip.findMany.mock.calls[0][0];
    const orClause = callArgs?.where?.OR ?? [];
    const ownerCondition = orClause.find((c: Record<string, unknown>) => 'ownerId' in c);
    expect(ownerCondition?.ownerId).toBe(MOCK_USER_ID);
  });

  it('returns an empty array when the user has no trips', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);

    const req = makeRequest('/api/trips');
    const res = await tripsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockRejectedValueOnce(new Error('DB exploded'));

    const req = makeRequest('/api/trips');
    const res = await tripsGET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// POST /api/trips
// ===========================================================================
describe('POST /api/trips', () => {
  const VALID_BODY = {
    title: 'Paris Getaway',
    description: 'A city break',
    destination: { city: 'Paris', country: 'France' },
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    isPublic: false,
    memberEmails: [],
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_BODY });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.create).not.toHaveBeenCalled();
  });

  it('creates a trip with valid data and returns 201', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.create.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_BODY });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
    expect(mockPrismaTrip.create).toHaveBeenCalledOnce();
  });

  it('sets ownerId to the session user id on create', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.create.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_BODY });
    await tripsPOST(req);

    const createCall = mockPrismaTrip.create.mock.calls[0][0];
    expect(createCall?.data?.ownerId).toBe(MOCK_USER_ID);
  });

  it('returns 400 when title is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const invalidBody = { ...VALID_BODY, title: '' };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTrip.create).not.toHaveBeenCalled();
  });

  it('returns 400 when destination is missing city', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const invalidBody = {
      ...VALID_BODY,
      destination: { country: 'France' }, // missing city
    };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockPrismaTrip.create).not.toHaveBeenCalled();
  });

  it('returns 400 when destination is missing country', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const invalidBody = {
      ...VALID_BODY,
      destination: { city: 'Paris' }, // missing country
    };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when startDate is absent', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const { startDate: _omitted, ...bodyWithoutStart } = VALID_BODY;
    const req = makeRequest('/api/trips', { method: 'POST', body: bodyWithoutStart });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when coverImage is not a valid URL', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const invalidBody = { ...VALID_BODY, coverImage: 'not-a-url' };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when memberEmails contains an invalid email', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const invalidBody = { ...VALID_BODY, memberEmails: ['not-an-email'] };
    const req = makeRequest('/api/trips', { method: 'POST', body: invalidBody });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 500 when Prisma throws during creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.create.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('/api/trips', { method: 'POST', body: VALID_BODY });
    const res = await tripsPOST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/trips/[tripId]
// ===========================================================================
describe('GET /api/trips/[tripId]', () => {
  /** Helper to call the handler with resolved dynamic params. */
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`);
    return tripByIdGET(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 404 when the trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet('nonexistent-id');
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
  });

  it('returns trip data when authenticated and a member', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    // Update mock to handle view count increment (public trips only)
    mockPrismaTrip.update.mockResolvedValueOnce(MOCK_TRIP);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
  });

  it('returns 401 for a private trip when the user has no session', async () => {
    const privateTrip = { ...MOCK_TRIP, isPublic: false, ownerId: 'other-user', members: [] };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(privateTrip);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('allows unauthenticated access to public trips', async () => {
    const publicTrip = {
      ...MOCK_TRIP,
      isPublic: true,
      ownerId: 'other-user',
      members: [],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(publicTrip);
    // The handler calls trip.update to increment viewCount for public trips
    mockPrismaTrip.update.mockResolvedValueOnce(publicTrip);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('increments viewCount for a public trip viewed by a non-owner', async () => {
    const publicTrip = {
      ...MOCK_TRIP,
      isPublic: true,
      ownerId: 'other-user',
      members: [],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(publicTrip);
    mockPrismaTrip.update.mockResolvedValueOnce(publicTrip);

    await callGet(MOCK_TRIP_ID);

    expect(mockPrismaTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_TRIP_ID },
        data: { viewCount: { increment: 1 } },
      })
    );
  });

  it('does NOT increment viewCount when the owner views their own public trip', async () => {
    // Owner views their own public trip
    const publicOwnedTrip = { ...MOCK_TRIP, isPublic: true };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(publicOwnedTrip);

    await callGet(MOCK_TRIP_ID, MOCK_SESSION); // session.user.id === ownerId

    expect(mockPrismaTrip.update).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// PATCH /api/trips/[tripId]
// ===========================================================================
describe('PATCH /api/trips/[tripId]', () => {
  const VALID_PATCH_BODY = { title: 'Updated Title', isPublic: true };

  async function callPatch(tripId: string, body: unknown, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`, { method: 'PATCH', body });
    return tripByIdPATCH(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPatch(MOCK_TRIP_ID, VALID_PATCH_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not an owner or admin', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null); // no membership

    const res = await callPatch(MOCK_TRIP_ID, VALID_PATCH_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTrip.update).not.toHaveBeenCalled();
  });

  it('updates the trip and returns 200 for an owner', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'OWNER' as TripMemberRole,
      joinedAt: new Date('2026-01-01'),
      budgetRange: null,
      departureCity: null,
      flightDetails: null,
    });
    mockPrismaTrip.update.mockResolvedValueOnce({ ...MOCK_TRIP, title: 'Updated Title', isPublic: true });

    const res = await callPatch(MOCK_TRIP_ID, VALID_PATCH_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTrip.update).toHaveBeenCalledOnce();
  });

  it('returns 400 for an invalid status value', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'OWNER' as TripMemberRole,
      joinedAt: new Date('2026-01-01'),
      budgetRange: null,
      departureCity: null,
      flightDetails: null,
    });

    const res = await callPatch(MOCK_TRIP_ID, { status: 'INVALID_STATUS' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/trips/[tripId]
// ===========================================================================
describe('DELETE /api/trips/[tripId]', () => {
  async function callDelete(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}`, { method: 'DELETE' });
    return tripByIdDELETE(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callDelete(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not the owner', async () => {
    // isTripOwner calls prisma.trip.findFirst — return null to signal "not owner"
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });

  it('deletes the trip and returns 200 for the owner', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(MOCK_TRIP); // isTripOwner succeeds
    mockPrismaTrip.delete.mockResolvedValueOnce(MOCK_TRIP);

    const res = await callDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTrip.delete).toHaveBeenCalledWith({ where: { id: MOCK_TRIP_ID } });
  });

  it('returns 500 when Prisma delete throws', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaTrip.delete.mockRejectedValueOnce(new Error('FK constraint'));

    const res = await callDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});
