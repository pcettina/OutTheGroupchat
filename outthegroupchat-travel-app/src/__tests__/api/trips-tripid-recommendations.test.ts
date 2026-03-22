/**
 * Unit tests for GET /api/trips/[tripId]/recommendations
 *                 POST /api/trips/[tripId]/recommendations
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, RecommendationService) are
 *   mocked via setup.ts and local vi.mock() overrides.
 * - tripSurvey and notification.createMany are not in setup.ts; they are
 *   patched here via vi.mocked() after setup.ts installs the base mock.
 * - Each test sets its own mocks with mockResolvedValueOnce only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Mock RecommendationService before importing the route so the module is
// replaced before any top-level imports in the route execute.
vi.mock('@/services/recommendation.service', () => ({
  RecommendationService: {
    generateRecommendations: vi.fn(),
    applyRecommendation: vi.fn(),
  },
}));

import { GET, POST } from '@/app/api/trips/[tripId]/recommendations/route';
import { RecommendationService } from '@/services/recommendation.service';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaNotification = vi.mocked(prisma.notification) as typeof prisma.notification & {
  createMany: ReturnType<typeof vi.fn>;
};

// Patch prisma mock with methods not in setup.ts
// tripSurvey is not present in setup.ts at all — add it here.
const mockPrismaTripSurvey = {
  findUnique: vi.fn(),
};
// @ts-expect-error tripSurvey is not in the base mock type
prisma.tripSurvey = mockPrismaTripSurvey;

// notification.createMany may not exist in setup.ts — add defensively
if (!(prisma.notification as unknown as Record<string, unknown>).createMany) {
  (prisma.notification as unknown as Record<string, unknown>).createMany = vi.fn();
}

const mockRecommendationService = vi.mocked(RecommendationService);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-rec-001';
const MOCK_TRIP_ID = 'trip-rec-001';
const MOCK_SURVEY_ID = 'survey-rec-001';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Rec User', email: 'rec@example.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER_ROW = {
  id: 'member-rec-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  joinedAt: new Date('2026-01-01'),
};

const MOCK_SURVEY = {
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

const MOCK_UPDATED_TRIP = {
  id: MOCK_TRIP_ID,
  destination: 'Paris',
  itinerary: { items: [] },
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeGetRequest(tripId: string): Request {
  return new Request(`http://localhost:3000/api/trips/${tripId}/recommendations`, {
    method: 'GET',
  });
}

function makePostRequest(tripId: string, body: unknown): Request {
  return new Request(`http://localhost:3000/api/trips/${tripId}/recommendations`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Clear all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/recommendations
// ===========================================================================
describe('GET /api/trips/[tripId]/recommendations', () => {
  async function callGet(tripId = MOCK_TRIP_ID, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeGetRequest(tripId);
    return GET(req, { params: { tripId } });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a trip member', async () => {
    // findFirst for member check returns null (not a member)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
  });

  it('returns 400 when no survey exists for the trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    // tripSurvey.findUnique returns null → no survey
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(null);

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey/i);
  });

  it('returns 400 when survey exists but has no responses', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce({
      ...MOCK_SURVEY,
      _count: { responses: 0 },
    });

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey responses/i);
  });

  it('returns recommendations list for trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY);
    (RecommendationService.generateRecommendations as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      MOCK_RECOMMENDATIONS as unknown as Awaited<ReturnType<typeof RecommendationService.generateRecommendations>>
    );

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].destination).toBe('Paris');
    expect(mockRecommendationService.generateRecommendations).toHaveBeenCalledWith(
      MOCK_TRIP_ID,
      MOCK_SURVEY_ID,
      5
    );
  });

  it('returns empty array when generateRecommendations returns no results', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY);
    (RecommendationService.generateRecommendations as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof RecommendationService.generateRecommendations>>
    );

    const res = await callGet();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/recommendations
// ===========================================================================
describe('POST /api/trips/[tripId]/recommendations', () => {
  const VALID_BODY = {
    destination: 'Paris',
    estimatedBudget: 2000,
    description: 'City of Light',
  };

  async function callPost(
    body: unknown = VALID_BODY,
    tripId = MOCK_TRIP_ID,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makePostRequest(tripId, body);
    return POST(req, { params: { tripId } });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(VALID_BODY, MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not an OWNER or ADMIN', async () => {
    // The POST handler checks for role IN ['OWNER', 'ADMIN']
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost();
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not authorized/i);
  });

  it('creates recommendation and returns updated trip successfully', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    (RecommendationService.applyRecommendation as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(undefined);
    // findMany for other members (notifications)
    mockPrismaTripMember.findMany.mockResolvedValueOnce([
      { id: 'member-other', userId: 'user-other', tripId: MOCK_TRIP_ID, role: 'MEMBER' },
    ]);
    // notification.createMany
    (mockPrismaNotification.createMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
    // trip.findUnique for updated trip
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_UPDATED_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const res = await callPost();
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.destination).toBe('Paris');
    expect(mockRecommendationService.applyRecommendation).toHaveBeenCalledWith(
      MOCK_TRIP_ID,
      VALID_BODY
    );
  });

  it('returns 400 on invalid input (missing destination and estimatedBudget)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    const res = await callPost({ someOtherField: 'value' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid recommendation data/i);
  });

  it('returns 400 when only destination is provided (missing estimatedBudget)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    const res = await callPost({ destination: 'Tokyo' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid recommendation data/i);
  });
});
