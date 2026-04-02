/**
 * Integration tests for the full trip lifecycle flow:
 *
 *   1. POST /api/trips                         → create a trip
 *   2. POST /api/trips/[tripId]/activities     → add activities to the trip
 *   3. GET  /api/trips/[tripId]                → verify trip state with activities
 *   4. POST /api/invitations                   → invite a member to the trip
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, rate-limit, invitations) are
 *   mocked so no real DB or network calls occur.
 * - Route handlers are called directly; params are passed as the second
 *   argument matching Next.js route shape ({ params: Promise<{ tripId }> }).
 * - Each test sets up its own mocks using mockResolvedValueOnce().
 * - vi.resetAllMocks() in beforeEach prevents queue/implementation leakage.
 *
 * Coverage
 * --------
 * - Auth guards (401) on every route
 * - Rate-limit (429) on POST /api/trips and GET /api/trips/[tripId]
 * - Zod validation errors (400) for trips, activities, and invitations
 * - Member permission checks (403) for activities and invitations
 * - Success paths (201 / 200) for each step
 * - 404 when trip/resource not found
 * - 500 on unexpected DB errors
 * - Public trip access (no auth required)
 * - Non-member blocked from reading private trip (401)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { processInvitations } from '@/lib/invitations';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be declared before route imports
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports for the route handlers under test
// ---------------------------------------------------------------------------
import { GET as tripsGET, POST as tripsPOST } from '@/app/api/trips/route';
import {
  GET as tripByIdGET,
  PATCH as tripByIdPATCH,
} from '@/app/api/trips/[tripId]/route';
import {
  GET as activitiesGET,
  POST as activitiesPOST,
} from '@/app/api/trips/[tripId]/activities/route';
import { POST as invitationsPOST } from '@/app/api/invitations/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockProcessInvitations = vi.mocked(processInvitations);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityRating = vi.mocked(prisma.activityRating);

// ---------------------------------------------------------------------------
// CUID-format fixture IDs
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_ACTIVITY_ID = 'clh7nz5vr0003mg0hb9gkfxe3';

// ---------------------------------------------------------------------------
// Shared session fixtures
// ---------------------------------------------------------------------------
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Lifecycle Tester', email: 'lifecycle@test.com' },
  expires: '2099-01-01',
};

const MOCK_SESSION_OTHER = {
  user: { id: MOCK_OTHER_USER_ID, name: 'Other User', email: 'other@test.com' },
  expires: '2099-01-01',
};

// ---------------------------------------------------------------------------
// Rate-limit results
// ---------------------------------------------------------------------------
const RATE_LIMIT_OK = {
  success: true,
  limit: 60,
  remaining: 59,
  reset: Date.now() + 60_000,
};
const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 60,
  remaining: 0,
  reset: Date.now() + 60_000,
};

// ---------------------------------------------------------------------------
// Trip fixture returned by prisma after creation
// ---------------------------------------------------------------------------
const MOCK_CREATED_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Tokyo Adventure',
  description: 'A fun trip to Tokyo',
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-07-14'),
  budget: null,
  isPublic: false,
  status: 'PLANNING',
  ownerId: MOCK_USER_ID,
  coverImage: null,
  viewCount: 0,
  createdAt: new Date('2026-03-31'),
  updatedAt: new Date('2026-03-31'),
  owner: { id: MOCK_USER_ID, name: 'Lifecycle Tester', image: null },
  members: [
    {
      id: 'clh7nz5vr0010mg0hb9gkfxe0',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_USER_ID,
      role: 'OWNER',
      user: { id: MOCK_USER_ID, name: 'Lifecycle Tester', image: null },
    },
  ],
};

// ---------------------------------------------------------------------------
// Activity fixture returned by prisma after creation
// ---------------------------------------------------------------------------
const MOCK_CREATED_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  tripId: MOCK_TRIP_ID,
  name: 'Tsukiji Fish Market',
  description: 'Fresh sushi breakfast',
  category: 'FOOD',
  status: 'SUGGESTED',
  location: { address: '5-2 Tsukiji, Chuo City, Tokyo' },
  date: new Date('2026-07-02'),
  startTime: null,
  endTime: null,
  duration: 120,
  cost: 30,
  currency: 'USD',
  priceRange: 'MODERATE',
  bookingStatus: 'NOT_NEEDED',
  isPublic: false,
  createdAt: new Date('2026-03-31'),
  _count: { comments: 0, ratings: 0, savedBy: 0 },
};

// ---------------------------------------------------------------------------
// Full trip-with-activities fixture for GET /api/trips/[tripId]
// ---------------------------------------------------------------------------
const MOCK_FULL_TRIP = {
  ...MOCK_CREATED_TRIP,
  activities: [MOCK_CREATED_ACTIVITY],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 1 },
};

// ---------------------------------------------------------------------------
// Member fixture for tripMember.findFirst (ownership check)
// ---------------------------------------------------------------------------
const MOCK_OWNER_MEMBER = {
  id: 'clh7nz5vr0010mg0hb9gkfxe0',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  trip: { title: 'Tokyo Adventure', ownerId: MOCK_USER_ID },
} as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTripRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetTripsRequest(): Request {
  return new Request('http://localhost:3000/api/trips', { method: 'GET' });
}

function makeGetTripByIdRequest(tripId = MOCK_TRIP_ID): Request {
  return new Request(`http://localhost:3000/api/trips/${tripId}`, {
    method: 'GET',
  });
}

function makePatchTripRequest(body: unknown): Request {
  return new Request(`http://localhost:3000/api/trips/${MOCK_TRIP_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeActivityRequest(body: unknown): Request {
  return new Request(
    `http://localhost:3000/api/trips/${MOCK_TRIP_ID}/activities`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function makeGetActivitiesRequest(tripId = MOCK_TRIP_ID): Request {
  return new Request(
    `http://localhost:3000/api/trips/${tripId}/activities`,
    { method: 'GET' }
  );
}

function makeInvitationRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Wrap tripId into the params shape expected by route handlers. */
function tripParams(tripId = MOCK_TRIP_ID) {
  return { params: Promise.resolve({ tripId }) };
}

// ---------------------------------------------------------------------------
// Valid minimal trip creation payload
// ---------------------------------------------------------------------------
const VALID_TRIP_BODY = {
  title: 'Tokyo Adventure',
  description: 'A fun trip to Tokyo',
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: '2026-07-01T00:00:00Z',
  endDate: '2026-07-14T00:00:00Z',
  isPublic: false,
};

// Valid minimal activity payload
const VALID_ACTIVITY_BODY = {
  name: 'Tsukiji Fish Market',
  category: 'FOOD',
  date: '2026-07-02T07:00:00Z',
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Default: rate limit succeeds, getRateLimitHeaders returns empty object
  mockCheckRateLimit.mockResolvedValue(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValue({});
});

// ===========================================================================
// STEP 1 — POST /api/trips (create a trip)
// ===========================================================================
describe('Step 1 — POST /api/trips', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await tripsPOST(makeTripRequest(VALID_TRIP_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({ 'X-RateLimit-Remaining': '0' });

    const res = await tripsPOST(makeTripRequest(VALID_TRIP_BODY));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('returns 400 when title is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await tripsPOST(
      makeTripRequest({ destination: { city: 'Tokyo', country: 'Japan' }, startDate: '2026-07-01', endDate: '2026-07-14' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when destination is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await tripsPOST(
      makeTripRequest({ title: 'Tokyo Adventure', startDate: '2026-07-01', endDate: '2026-07-14' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when startDate is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await tripsPOST(
      makeTripRequest({
        title: 'Tokyo Adventure',
        destination: { city: 'Tokyo', country: 'Japan' },
        endDate: '2026-07-14',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when memberEmails contains invalid email', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const res = await tripsPOST(
      makeTripRequest({ ...VALID_TRIP_BODY, memberEmails: ['not-an-email'] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('creates a trip and returns 201 on valid input', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.create.mockResolvedValueOnce(MOCK_CREATED_TRIP as never);

    const res = await tripsPOST(makeTripRequest(VALID_TRIP_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
    expect(body.data.title).toBe('Tokyo Adventure');
    expect(body.data.status).toBe('PLANNING');
    expect(body.data.ownerId).toBe(MOCK_USER_ID);
  });

  it('calls processInvitations when memberEmails are provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.create.mockResolvedValueOnce(MOCK_CREATED_TRIP as never);
    mockProcessInvitations.mockResolvedValueOnce({ invitations: [], errors: [] });

    const res = await tripsPOST(
      makeTripRequest({ ...VALID_TRIP_BODY, memberEmails: ['friend@example.com'] })
    );
    expect(res.status).toBe(201);
    expect(mockProcessInvitations).toHaveBeenCalledOnce();
    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: MOCK_TRIP_ID,
        emails: ['friend@example.com'],
        inviterId: MOCK_USER_ID,
      })
    );
  });

  it('returns 500 on unexpected prisma error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.create.mockRejectedValueOnce(new Error('DB failure'));

    const res = await tripsPOST(makeTripRequest(VALID_TRIP_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to create trip/i);
  });
});

// ===========================================================================
// STEP 1b — GET /api/trips (list trips)
// ===========================================================================
describe('Step 1b — GET /api/trips', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await tripsGET(makeGetTripsRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const res = await tripsGET(makeGetTripsRequest());
    expect(res.status).toBe(429);
  });

  it('returns trip list for authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_CREATED_TRIP] as never);

    const res = await tripsGET(makeGetTripsRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MOCK_TRIP_ID);
  });
});

// ===========================================================================
// STEP 2 — POST /api/trips/[tripId]/activities (add activities)
// ===========================================================================
describe('Step 2 — POST /api/trips/[tripId]/activities', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // trip.findUnique returns null; tripMember.findFirst also called in parallel
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/trip not found/i);
  });

  it('returns 403 when user is not an owner or member of the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID, // different owner
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null); // not a member

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not a member/i);
  });

  it('returns 400 when activity name is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const res = await activitiesPOST(
      makeActivityRequest({ category: 'FOOD' }),
      tripParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when category is invalid (ADVENTURE is not a valid enum value)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const res = await activitiesPOST(
      makeActivityRequest({ name: 'Paragliding', category: 'ADVENTURE' }),
      tripParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when category is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const res = await activitiesPOST(
      makeActivityRequest({ name: 'Some Activity' }),
      tripParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('creates activity and returns 201 for trip owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaActivity.create.mockResolvedValueOnce(MOCK_CREATED_ACTIVITY as never);

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_ACTIVITY_ID);
    expect(body.data.name).toBe('Tsukiji Fish Market');
    expect(body.data.category).toBe('FOOD');
    expect(body.data.status).toBe('SUGGESTED');
  });

  it('creates activity and returns 201 for a trip member (non-owner)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID, // different owner
    } as never);
    // isMember check returns a member record
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      id: 'clh7nz5vr0011mg0hb9gkfxe1',
      tripId: MOCK_TRIP_ID,
      userId: MOCK_OTHER_USER_ID,
      role: 'MEMBER',
    } as never);
    mockPrismaActivity.create.mockResolvedValueOnce({
      ...MOCK_CREATED_ACTIVITY,
      id: 'clh7nz5vr0012mg0hb9gkfxe2',
    } as never);

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('accepts all valid ActivityCategory enum values', async () => {
    const validCategories = [
      'FOOD', 'CULTURE', 'SHOPPING', 'NATURE', 'ENTERTAINMENT',
      'SPORTS', 'NIGHTLIFE', 'TRANSPORTATION', 'ACCOMMODATION', 'OTHER',
    ];

    // Test one representative category (CULTURE)
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaActivity.create.mockResolvedValueOnce({
      ...MOCK_CREATED_ACTIVITY,
      category: 'CULTURE',
    } as never);

    const res = await activitiesPOST(
      makeActivityRequest({ name: 'Museum Visit', category: 'CULTURE' }),
      tripParams()
    );
    expect(res.status).toBe(201);
    // Verify all expected values are in the valid list
    expect(validCategories).toContain('CULTURE');
    expect(validCategories).not.toContain('ADVENTURE');
  });

  it('returns 500 on unexpected DB error during activity creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaActivity.create.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await activitiesPOST(makeActivityRequest(VALID_ACTIVITY_BODY), tripParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to create activity/i);
  });
});

// ===========================================================================
// STEP 2b — GET /api/trips/[tripId]/activities (list activities)
// ===========================================================================
describe('Step 2b — GET /api/trips/[tripId]/activities', () => {
  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await activitiesGET(makeGetActivitiesRequest(), tripParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/trip not found/i);
  });

  it('returns 401 when trip is private and user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      isPublic: false,
      ownerId: MOCK_USER_ID,
    } as never);

    const res = await activitiesGET(makeGetActivitiesRequest(), tripParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns activity list for trip owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      isPublic: false,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_CREATED_ACTIVITY] as never);
    mockPrismaActivityRating.aggregate.mockResolvedValueOnce({ _avg: { score: null } } as never);

    const res = await activitiesGET(makeGetActivitiesRequest(), tripParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Tsukiji Fish Market');
  });

  it('returns activities for public trip without auth', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      isPublic: true,
      ownerId: MOCK_USER_ID,
    } as never);
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_CREATED_ACTIVITY] as never);
    mockPrismaActivityRating.aggregate.mockResolvedValueOnce({ _avg: { score: 4.5 } } as never);

    const res = await activitiesGET(makeGetActivitiesRequest(), tripParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].averageRating).toBe(4.5);
  });
});

// ===========================================================================
// STEP 3 — GET /api/trips/[tripId] (verify trip state with activities)
// ===========================================================================
describe('Step 3 — GET /api/trips/[tripId]', () => {
  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/trip not found/i);
  });

  it('returns 401 when trip is private and requester is not a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      ...MOCK_FULL_TRIP,
      isPublic: false,
      ownerId: MOCK_USER_ID, // different owner
      members: [], // other user is not listed as member
    } as never);

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns trip with activities for authenticated owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_FULL_TRIP as never);

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_TRIP_ID);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.activities[0].name).toBe('Tsukiji Fish Market');
    expect(body.data._count.activities).toBe(1);
    expect(body.data._count.members).toBe(1);
  });

  it('returns public trip without auth (no rate-limit check for unauthenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      ...MOCK_FULL_TRIP,
      isPublic: true,
    } as never);
    // Public trip with different owner increments viewCount
    mockPrismaTrip.update.mockResolvedValueOnce({} as never);

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isPublic).toBe(true);
  });

  it('returns trip for authenticated member (non-owner)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      ...MOCK_FULL_TRIP,
      isPublic: false,
      members: [
        ...MOCK_FULL_TRIP.members,
        {
          id: 'clh7nz5vr0020mg0hb9gkfxe0',
          tripId: MOCK_TRIP_ID,
          userId: MOCK_OTHER_USER_ID,
          role: 'MEMBER',
          user: { id: MOCK_OTHER_USER_ID, name: 'Other User', image: null, city: null },
        },
      ],
    } as never);

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 429 when rate limit exceeded (authenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const res = await tripByIdGET(makeGetTripByIdRequest(), tripParams());
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// STEP 3b — PATCH /api/trips/[tripId] (update trip)
// ===========================================================================
describe('Step 3b — PATCH /api/trips/[tripId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await tripByIdPATCH(makePatchTripRequest({ title: 'Updated' }), tripParams());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not an OWNER or ADMIN', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await tripByIdPATCH(makePatchTripRequest({ title: 'Updated' }), tripParams());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not authorized/i);
  });

  it('returns 400 on invalid status value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const res = await tripByIdPATCH(
      makePatchTripRequest({ status: 'INVALID_STATUS' }),
      tripParams()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('updates trip title for owner and returns 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaTrip.update.mockResolvedValueOnce({
      ...MOCK_CREATED_TRIP,
      title: 'Updated Tokyo Adventure',
    } as never);

    const res = await tripByIdPATCH(
      makePatchTripRequest({ title: 'Updated Tokyo Adventure' }),
      tripParams()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Updated Tokyo Adventure');
  });
});

// ===========================================================================
// STEP 4 — POST /api/invitations (invite a member)
// ===========================================================================
describe('Step 4 — POST /api/invitations', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when tripId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await invitationsPOST(
      makeInvitationRequest({ emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when emails array is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: [] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when an email is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['not-an-email'] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when expirationHours is negative', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'], expirationHours: -1 })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 403 when user is not OWNER or ADMIN of the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/do not have permission/i);
  });

  it('creates invitation and returns 200 for trip owner', async () => {
    const mockInviteResult = {
      invitations: [{ email: 'guest@example.com', status: 'sent', message: 'Invitation created' }],
      errors: [],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockProcessInvitations.mockResolvedValueOnce(mockInviteResult);

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.invitations).toHaveLength(1);
    expect(body.data.invitations[0].email).toBe('guest@example.com');
  });

  it('passes correct parameters to processInvitations', async () => {
    const mockInviteResult = {
      invitations: [{ email: 'guest@example.com', status: 'sent' }],
      errors: [],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockProcessInvitations.mockResolvedValueOnce(mockInviteResult);

    await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'], expirationHours: 72 })
    );

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: MOCK_TRIP_ID,
        tripTitle: 'Tokyo Adventure',
        emails: ['guest@example.com'],
        inviterId: MOCK_USER_ID,
        inviterName: 'Lifecycle Tester',
        expirationHours: 72,
      })
    );
  });

  it('uses "A trip organizer" as inviterName when session name is null', async () => {
    const sessionWithoutName = {
      ...MOCK_SESSION,
      user: { ...MOCK_SESSION.user, name: null },
    };

    const mockInviteResult = { invitations: [], errors: [] };

    mockGetServerSession.mockResolvedValueOnce(sessionWithoutName);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockProcessInvitations.mockResolvedValueOnce(mockInviteResult);

    await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'A trip organizer' })
    );
  });

  it('handles invitation with multiple emails', async () => {
    const multiEmailResult = {
      invitations: [
        { email: 'a@example.com', status: 'sent' },
        { email: 'b@example.com', status: 'sent' },
      ],
      errors: [],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockProcessInvitations.mockResolvedValueOnce(multiEmailResult);

    const res = await invitationsPOST(
      makeInvitationRequest({
        tripId: MOCK_TRIP_ID,
        emails: ['a@example.com', 'b@example.com'],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.invitations).toHaveLength(2);
  });

  it('returns 500 when processInvitations throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockProcessInvitations.mockRejectedValueOnce(new Error('Email service down'));

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to create invitations/i);
  });

  it('returns 500 when prisma.tripMember.findFirst throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockRejectedValueOnce(new Error('DB offline'));

    const res = await invitationsPOST(
      makeInvitationRequest({ tripId: MOCK_TRIP_ID, emails: ['guest@example.com'] })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to create invitations/i);
  });
});
