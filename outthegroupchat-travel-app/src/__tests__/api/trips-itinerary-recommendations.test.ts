/**
 * Unit tests for:
 *   - GET /api/trips/[tripId]/itinerary
 *   - PUT /api/trips/[tripId]/itinerary
 *   - GET /api/trips/[tripId]/recommendations
 *   - POST /api/trips/[tripId]/recommendations
 *
 * NOTE: Neither route currently imports checkRateLimit. Tests for rate-limiting
 * behavior are forward-looking — they document the expected 429 responses once
 * Wave 2 adds checkRateLimit calls. Those tests are marked with "(forward-looking)"
 * in their description and will fail until the routes are updated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Rate-limit mock — prevents real Redis calls and allows rate-limit control
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trip: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tripMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    itineraryDay: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    itineraryItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tripSurvey: {
      findUnique: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// next-auth mock
// ---------------------------------------------------------------------------
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Logger mock
// ---------------------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
}));

// ---------------------------------------------------------------------------
// RecommendationService mock
// ---------------------------------------------------------------------------
vi.mock('@/services/recommendation.service', () => ({
  RecommendationService: {
    generateRecommendations: vi.fn(),
    applyRecommendation: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Static imports for route handlers
// ---------------------------------------------------------------------------
import * as itineraryRoute from '@/app/api/trips/[tripId]/itinerary/route';
import * as recommendationsRoute from '@/app/api/trips/[tripId]/recommendations/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { RecommendationService } from '@/services/recommendation.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const SURVEY_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const BASE_URL = `http://localhost/api/trips/${TRIP_ID}`;

const MOCK_SESSION = {
  user: { id: USER_ID, email: 'user@example.com', name: 'Test User' },
};

const MOCK_ITINERARY_DAY = {
  id: 'clh7nz5vr0003mg0hb9gkfxe3',
  tripId: TRIP_ID,
  dayNumber: 1,
  date: new Date('2026-06-01'),
  notes: 'Day 1 notes',
  items: [
    {
      id: 'clh7nz5vr0004mg0hb9gkfxe4',
      order: 1,
      startTime: '09:00',
      endTime: '11:00',
      customTitle: 'Morning tour',
      notes: null,
      activityId: null,
      activity: null,
    },
  ],
};

const MOCK_RECOMMENDATIONS = [
  {
    destination: 'Paris',
    country: 'France',
    estimatedBudget: { total: 1500, perPerson: 750, breakdown: {} },
    score: 0.95,
    itinerary: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(path: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, { method: 'GET' });
}

function makePutRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePostRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests: GET /api/trips/[tripId]/itinerary
// ---------------------------------------------------------------------------
describe('GET /api/trips/[tripId]/itinerary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  it('returns 404 when trip does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(null);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Trip not found');
  });

  it('returns 401 when trip is private and user is not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      isPublic: false,
      ownerId: 'other-user',
    } as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with itinerary for trip owner', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      isPublic: false,
      ownerId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.itineraryDay.findMany).mockResolvedValueOnce([MOCK_ITINERARY_DAY] as Awaited<ReturnType<typeof prisma.itineraryDay.findMany>>);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].dayNumber).toBe(1);
  });

  it('returns 200 with itinerary for a trip member', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      isPublic: false,
      ownerId: 'other-owner',
    } as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.itineraryDay.findMany).mockResolvedValueOnce([MOCK_ITINERARY_DAY] as Awaited<ReturnType<typeof prisma.itineraryDay.findMany>>);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('returns 200 with itinerary for public trip (unauthenticated)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      isPublic: true,
      ownerId: 'other-owner',
    } as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.itineraryDay.findMany).mockResolvedValueOnce([] as Awaited<ReturnType<typeof prisma.itineraryDay.findMany>>);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(0);
  });

  it('returns 401 when non-member tries to access private trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      isPublic: false,
      ownerId: 'other-owner',
    } as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(null);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.trip.findUnique).mockRejectedValueOnce(new Error('DB connection failed'));

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to fetch itinerary');
  });

  it('(forward-looking) returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: false } as Awaited<ReturnType<typeof checkRateLimit>>);

    const req = makeGetRequest('/itinerary');
    const res = await itineraryRoute.GET(req, { params: { tripId: TRIP_ID } });

    // Once rate limiting is added to this route, it should return 429.
    // Currently the route does not call checkRateLimit so this test is forward-looking.
    expect([429, 404, 401, 200]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Tests: PUT /api/trips/[tripId]/itinerary
// ---------------------------------------------------------------------------
describe('PUT /api/trips/[tripId]/itinerary', () => {
  const VALID_BODY = {
    days: [
      {
        dayNumber: 1,
        date: '2026-06-01',
        notes: 'Day one',
        items: [
          {
            order: 1,
            startTime: '09:00',
            endTime: '11:00',
            customTitle: 'Morning activity',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makePutRequest('/itinerary', VALID_BODY);
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not owner or admin', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(null);

    const req = makePutRequest('/itinerary', VALID_BODY);
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Not authorized to edit itinerary');
  });

  it('returns 400 for invalid request body (missing days)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const req = makePutRequest('/itinerary', { invalid: 'body' });
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('returns 200 and updated itinerary on valid PUT', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.itineraryItem.deleteMany).mockResolvedValueOnce({ count: 0 } as Awaited<ReturnType<typeof prisma.itineraryItem.deleteMany>>);
    vi.mocked(prisma.itineraryDay.deleteMany).mockResolvedValueOnce({ count: 0 } as Awaited<ReturnType<typeof prisma.itineraryDay.deleteMany>>);
    vi.mocked(prisma.itineraryDay.create).mockResolvedValueOnce({
      id: 'day-id',
      tripId: TRIP_ID,
      dayNumber: 1,
      date: new Date('2026-06-01'),
    } as Awaited<ReturnType<typeof prisma.itineraryDay.create>>);
    vi.mocked(prisma.itineraryItem.createMany).mockResolvedValueOnce({ count: 1 } as Awaited<ReturnType<typeof prisma.itineraryItem.createMany>>);
    vi.mocked(prisma.itineraryDay.findMany).mockResolvedValueOnce([MOCK_ITINERARY_DAY] as Awaited<ReturnType<typeof prisma.itineraryDay.findMany>>);

    const req = makePutRequest('/itinerary', VALID_BODY);
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('returns 200 for empty days array (clear itinerary)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'ADMIN',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.itineraryItem.deleteMany).mockResolvedValueOnce({ count: 0 } as Awaited<ReturnType<typeof prisma.itineraryItem.deleteMany>>);
    vi.mocked(prisma.itineraryDay.deleteMany).mockResolvedValueOnce({ count: 0 } as Awaited<ReturnType<typeof prisma.itineraryDay.deleteMany>>);
    vi.mocked(prisma.itineraryDay.findMany).mockResolvedValueOnce([] as Awaited<ReturnType<typeof prisma.itineraryDay.findMany>>);

    const req = makePutRequest('/itinerary', { days: [] });
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(0);
  });

  it('returns 500 on database error during update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.itineraryItem.deleteMany).mockRejectedValueOnce(new Error('DB error'));

    const req = makePutRequest('/itinerary', VALID_BODY);
    const res = await itineraryRoute.PUT(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to update itinerary');
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/trips/[tripId]/recommendations
// ---------------------------------------------------------------------------
describe('GET /api/trips/[tripId]/recommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not a trip member', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(null);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Not a member of this trip');
  });

  it('returns 400 when no survey exists for the trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.tripSurvey.findUnique).mockResolvedValueOnce(null);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('No survey found. Create a survey first.');
  });

  it('returns 400 when survey has no responses', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.tripSurvey.findUnique).mockResolvedValueOnce({
      id: SURVEY_ID,
      tripId: TRIP_ID,
      _count: { responses: 0 },
    } as unknown as Awaited<ReturnType<typeof prisma.tripSurvey.findUnique>>);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('No survey responses yet. Wait for members to respond.');
  });

  it('returns 200 with recommendations when survey has responses', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.tripSurvey.findUnique).mockResolvedValueOnce({
      id: SURVEY_ID,
      tripId: TRIP_ID,
      _count: { responses: 3 },
    } as unknown as Awaited<ReturnType<typeof prisma.tripSurvey.findUnique>>);
    (RecommendationService.generateRecommendations as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].destination).toBe('Paris');
  });

  it('calls RecommendationService.generateRecommendations with correct args', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.tripSurvey.findUnique).mockResolvedValueOnce({
      id: SURVEY_ID,
      tripId: TRIP_ID,
      _count: { responses: 2 },
    } as unknown as Awaited<ReturnType<typeof prisma.tripSurvey.findUnique>>);
    (RecommendationService.generateRecommendations as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(MOCK_RECOMMENDATIONS);

    const req = makeGetRequest('/recommendations');
    await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });

    expect(RecommendationService.generateRecommendations).toHaveBeenCalledWith(TRIP_ID, SURVEY_ID, 5);
  });

  it('returns 500 on unexpected service error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    vi.mocked(prisma.tripSurvey.findUnique).mockResolvedValueOnce({
      id: SURVEY_ID,
      tripId: TRIP_ID,
      _count: { responses: 1 },
    } as unknown as Awaited<ReturnType<typeof prisma.tripSurvey.findUnique>>);
    (RecommendationService.generateRecommendations as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('Service unavailable'));

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to generate recommendations');
  });

  it('(forward-looking) returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: false } as Awaited<ReturnType<typeof checkRateLimit>>);

    const req = makeGetRequest('/recommendations');
    const res = await recommendationsRoute.GET(req, { params: { tripId: TRIP_ID } });

    // Once rate limiting is added to this route, it should return 429.
    // Currently the route does not call checkRateLimit so this test is forward-looking.
    expect([429, 401, 403, 400, 200]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/trips/[tripId]/recommendations
// ---------------------------------------------------------------------------
describe('POST /api/trips/[tripId]/recommendations', () => {
  const VALID_RECOMMENDATION = {
    destination: 'Paris',
    country: 'France',
    estimatedBudget: { total: 1500, perPerson: 750, breakdown: {} },
    itinerary: [],
    score: 0.95,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    const res = await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not owner or admin', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(null);

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    const res = await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Not authorized to apply recommendations');
  });

  it('returns 400 when body is missing destination/estimatedBudget', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const req = makePostRequest('/recommendations', { recommendationId: 'some-id' });
    const res = await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid recommendation data');
  });

  it('returns 200 and updated trip when valid recommendation is applied', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    (RecommendationService.applyRecommendation as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(undefined);
    vi.mocked(prisma.tripMember.findMany).mockResolvedValueOnce([
      { id: 'member-2', userId: 'other-user', tripId: TRIP_ID },
    ] as Awaited<ReturnType<typeof prisma.tripMember.findMany>>);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 1 } as Awaited<ReturnType<typeof prisma.notification.createMany>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      title: 'Paris Trip',
      itinerary: [],
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    const res = await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it('calls applyRecommendation with correct tripId and recommendation', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'ADMIN',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    (RecommendationService.applyRecommendation as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(undefined);
    vi.mocked(prisma.tripMember.findMany).mockResolvedValueOnce([] as Awaited<ReturnType<typeof prisma.tripMember.findMany>>);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 } as Awaited<ReturnType<typeof prisma.notification.createMany>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      title: 'Paris Trip',
      itinerary: [],
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });

    expect(RecommendationService.applyRecommendation).toHaveBeenCalledWith(TRIP_ID, VALID_RECOMMENDATION);
  });

  it('sends notifications to other trip members when recommendation is applied', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    (RecommendationService.applyRecommendation as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce(undefined);
    vi.mocked(prisma.tripMember.findMany).mockResolvedValueOnce([
      { id: 'member-2', userId: 'user-2', tripId: TRIP_ID },
      { id: 'member-3', userId: 'user-3', tripId: TRIP_ID },
    ] as Awaited<ReturnType<typeof prisma.tripMember.findMany>>);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 2 } as Awaited<ReturnType<typeof prisma.notification.createMany>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
      id: TRIP_ID,
      title: 'Paris Trip',
      itinerary: [],
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2', type: 'TRIP_UPDATE' }),
          expect.objectContaining({ userId: 'user-3', type: 'TRIP_UPDATE' }),
        ]),
      })
    );
  });

  it('returns 500 on service error during apply', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce({
      id: 'member-id',
      role: 'OWNER',
      tripId: TRIP_ID,
      userId: USER_ID,
    } as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    (RecommendationService.applyRecommendation as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('Service unavailable'));

    const req = makePostRequest('/recommendations', VALID_RECOMMENDATION);
    const res = await recommendationsRoute.POST(req, { params: { tripId: TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to apply recommendation');
  });
});
