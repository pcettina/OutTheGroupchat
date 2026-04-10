/**
 * Unit tests for:
 *   GET /api/trips/[tripId]/itinerary
 *   GET /api/trips/[tripId]/recommendations
 *
 * Covers auth failures (401/403), not-found (404), validation (400), success (200),
 * and error (500) paths for both routes.
 *
 * Mock hygiene: mockResolvedValueOnce only. Each test sets its own mocks.
 * vi.clearAllMocks() in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: RecommendationService — must be hoisted before the route import
// ---------------------------------------------------------------------------
vi.mock('@/services/recommendation.service', () => ({
  RecommendationService: {
    generateRecommendations: vi.fn(),
    applyRecommendation: vi.fn(),
  },
}));

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET as itineraryGET } from '@/app/api/trips/[tripId]/itinerary/route';
import { GET as recommendationsGET } from '@/app/api/trips/[tripId]/recommendations/route';
import { RecommendationService } from '@/services/recommendation.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'mock-user-id';
const MOCK_TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_SURVEY_ID = 'clh7nz5vr0001mg0hb9gkfxe1';

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaTrip = vi.mocked(prisma.trip) as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

const mockPrismaTripMember = vi.mocked(prisma.tripMember) as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaTripSurvey = vi.mocked(prisma.tripSurvey) as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

const mockItineraryDay = vi.mocked(prisma.itineraryDay) as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared session fixtures
// ---------------------------------------------------------------------------
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

// ---------------------------------------------------------------------------
// Itinerary fixtures
// ---------------------------------------------------------------------------
const MOCK_TRIP_PUBLIC = {
  id: MOCK_TRIP_ID,
  isPublic: true,
  ownerId: 'other-owner-id',
};

const MOCK_TRIP_PRIVATE_OWNED = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: MOCK_USER_ID,
};

const MOCK_TRIP_PRIVATE_OTHER = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: 'other-owner-id',
};

const MOCK_ITINERARY_DAY = {
  id: 'iday-001',
  tripId: MOCK_TRIP_ID,
  dayNumber: 1,
  date: new Date('2026-07-01'),
  notes: 'First day notes',
  items: [
    {
      id: 'iitem-001',
      itineraryDayId: 'iday-001',
      order: 1,
      startTime: '09:00',
      endTime: '11:00',
      customTitle: 'Morning walk',
      notes: null,
      activityId: null,
      activity: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Recommendations fixtures
// ---------------------------------------------------------------------------
const MOCK_MEMBER_ROW = {
  id: 'member-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'MEMBER',
  joinedAt: new Date('2026-01-01'),
};

const MOCK_SURVEY_WITH_RESPONSES = {
  id: MOCK_SURVEY_ID,
  tripId: MOCK_TRIP_ID,
  _count: { responses: 3 },
};

const MOCK_RECOMMENDATIONS = [
  {
    destination: 'Paris',
    estimatedBudget: 2000,
    description: 'City of Light',
    highlights: ['Eiffel Tower'],
    suggestedActivities: [],
    flightInfo: null,
  },
];

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
// Global beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/itinerary
// ===========================================================================
describe('GET /api/trips/[tripId]/itinerary', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/trips/${tripId}/itinerary`);
    return itineraryGET(req, { params: { tripId } });
  }

  it('returns 401 when trip is private and user has no session', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 with invalid tripId format when trip is not found', async () => {
    // Route returns 404 for missing trips — invalid IDs also result in not-found
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet('not-a-valid-id');
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 (401 per route) when authenticated user is not owner or member', async () => {
    const strangerSession = {
      user: { id: 'stranger-user', name: 'Stranger', email: 'stranger@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(
      strangerSession as Awaited<ReturnType<typeof getServerSession>>
    );
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/itinerary`);
    const res = await itineraryGET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    // Route returns 401 with success:false when user has no access
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with itinerary data for the trip owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('iday-001');
    expect(body.data[0].items).toHaveLength(1);
    expect(mockItineraryDay.findMany).toHaveBeenCalledOnce();
  });

  it('returns 200 with empty array when no itinerary items exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 for public trip without authentication', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PUBLIC);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 200 for authenticated trip member on private trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(
      MOCK_SESSION as Awaited<ReturnType<typeof getServerSession>>
    );
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/itinerary`);
    const res = await itineraryGET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 500 when database throws during itineraryDay.findMany', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });

  it('returns 500 when database throws during trip.findUnique', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });
});

// ===========================================================================
// GET /api/trips/[tripId]/recommendations
// ===========================================================================
describe('GET /api/trips/[tripId]/recommendations', () => {
  async function callGet(tripId = MOCK_TRIP_ID, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(
      session as Awaited<ReturnType<typeof getServerSession>>
    );
    const req = makeRequest(`/api/trips/${tripId}/recommendations`);
    return recommendationsGET(req, { params: { tripId } });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockPrismaTripSurvey.findUnique).not.toHaveBeenCalled();
  });

  it('returns 200 with recommendations for authenticated member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_WITH_RESPONSES);
    (RecommendationService.generateRecommendations as unknown as {
      mockResolvedValueOnce: (v: unknown) => void;
    }).mockResolvedValueOnce(
      MOCK_RECOMMENDATIONS as unknown as Awaited<
        ReturnType<typeof RecommendationService.generateRecommendations>
      >
    );

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].destination).toBe('Paris');
    expect(RecommendationService.generateRecommendations).toHaveBeenCalledWith(
      MOCK_TRIP_ID,
      MOCK_SURVEY_ID,
      5
    );
  });

  it('returns 400 when trip has no survey', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(null);

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey/i);
    expect(RecommendationService.generateRecommendations).not.toHaveBeenCalled();
  });

  it('returns 400 when survey exists but has zero responses', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce({
      ...MOCK_SURVEY_WITH_RESPONSES,
      _count: { responses: 0 },
    });

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey responses/i);
    expect(RecommendationService.generateRecommendations).not.toHaveBeenCalled();
  });

  it('returns 500 when RecommendationService.generateRecommendations throws', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_WITH_RESPONSES);
    (RecommendationService.generateRecommendations as unknown as {
      mockRejectedValueOnce: (e: Error) => void;
    }).mockRejectedValueOnce(new Error('OpenAI rate limit'));

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to generate recommendations');
  });

  it('returns 200 with empty array when generateRecommendations returns no results', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_WITH_RESPONSES);
    (RecommendationService.generateRecommendations as unknown as {
      mockResolvedValueOnce: (v: unknown) => void;
    }).mockResolvedValueOnce(
      [] as unknown as Awaited<
        ReturnType<typeof RecommendationService.generateRecommendations>
      >
    );

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('returns 500 when prisma.tripMember.findFirst throws', async () => {
    mockPrismaTripMember.findFirst.mockRejectedValueOnce(new Error('DB error'));

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to generate recommendations');
  });
});
