/**
 * AI Service Chain Integration Tests
 *
 * Strategy
 * --------
 * - Tests three AI routes together as a group, focusing on error handling and
 *   edge cases not covered by the individual unit test files.
 * - All external dependencies (Prisma, NextAuth, AI SDK, rate-limit) are mocked.
 * - Route handlers are imported statically (avoids 10-second dynamic-import
 *   timeout seen with beforeEach imports).
 * - vi.clearAllMocks() is used in beforeEach; each test sets up its own mocks
 *   with mockResolvedValueOnce() to prevent state leakage.
 *
 * Coverage
 * --------
 * generate-itinerary: 503 when AI unavailable, graceful parse failure,
 *   invalid schema response, missing tripId validation, rate limit, 401 unauth,
 *   403 non-member, DB transaction error.
 *
 * suggest-activities: 503 when AI unavailable, empty recommendations from AI,
 *   malformed JSON from AI, missing destination validation, rate limit, 401 unauth.
 *
 * recommend: 401 unauth, 429 rate limit, 0-trip user history (graceful),
 *   AI returns non-JSON gracefully, validation error on bad limit param.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK) — declared before static imports
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client
// generate-itinerary and suggest-activities use isOpenAIConfigured + getModel.
// recommend uses checkRateLimit (legacy in-memory boolean) + getModel.
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(() => true), // legacy in-memory returns boolean
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — Redis-based rate limiting used by itinerary/suggest
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/prompts
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/prompts', () => ({
  itinerarySystemPrompt: 'You are an itinerary planning assistant.',
  buildItineraryPrompt: vi.fn().mockReturnValue('Build me an itinerary.'),
  activityRecommendationSystemPrompt: 'You are an activity recommendation assistant.',
  buildActivityPrompt: vi.fn().mockReturnValue('Suggest activities.'),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend setup.ts mock with $transaction support
// (generate-itinerary route uses prisma.$transaction)
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      tripMember: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      activity: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      itineraryDay: {
        create: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      itineraryItem: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Static imports of route handlers — must come AFTER all vi.mock() calls
// ---------------------------------------------------------------------------
import { POST as postItinerary } from '@/app/api/ai/generate-itinerary/route';
import { POST as postSuggest } from '@/app/api/ai/suggest-activities/route';
import { POST as postRecommend } from '@/app/api/ai/recommend/route';
import { generateText } from 'ai';
import { isOpenAIConfigured, getModel, checkRateLimit as clientRateLimit } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);
const mockIsOpenAIConfigured = vi.mocked(isOpenAIConfigured);
const mockGetModel = vi.mocked(getModel);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockClientRateLimit = vi.mocked(clientRateLimit);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaTransaction = vi.mocked(prisma.$transaction);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_CUID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'AI Tester', email: 'ai@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const RATE_LIMIT_OK = { success: true, limit: 20, remaining: 19, reset: Date.now() + 60000 };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 20, remaining: 0, reset: Date.now() + 60000 };

/** A trip row for generate-itinerary tests. */
const MOCK_TRIP = {
  id: VALID_CUID,
  title: 'Tokyo Adventure',
  description: 'A trip to Japan',
  status: 'PLANNING' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-07'),
  budget: { total: 4000, currency: 'USD' },
  coverImage: null,
  isPublic: false,
  viewCount: 0,
  ownerId: MOCK_USER_ID,
  members: [
    {
      userId: MOCK_USER_ID,
      user: {
        id: MOCK_USER_ID,
        name: 'AI Tester',
        preferences: { travelStyle: 'cultural', interests: ['food', 'art'], budgetRange: 'moderate' },
      },
    },
  ],
  survey: null,
  activities: [],
};

/** A valid single-day itinerary JSON string. */
const VALID_ITINERARY_JSON = JSON.stringify({
  overview: 'A great day in Tokyo.',
  days: [
    {
      dayNumber: 1,
      date: '2026-08-01',
      theme: 'Modern Tokyo',
      items: [
        {
          time: '10:00',
          title: 'Shibuya Crossing',
          description: 'The famous intersection',
          location: 'Shibuya, Tokyo',
          duration: 60,
          cost: { amount: 0, per: 'person' },
          category: 'activity',
          optional: false,
        },
      ],
      meals: {
        breakfast: { name: 'Ichiran Ramen', cuisine: 'Japanese', priceRange: '$$' },
        lunch: { name: 'Sushi Dai', cuisine: 'Sushi', priceRange: '$$$' },
        dinner: { name: 'Yakitori Alley', cuisine: 'Yakitori', priceRange: '$$' },
      },
      weatherBackup: 'TeamLab Borderless indoors',
    },
  ],
  budgetBreakdown: { accommodation: 1200, food: 600, activities: 300, transport: 200, total: 2300 },
  packingTips: ['Light layers', 'Comfortable shoes'],
  localTips: ['Use Suica card', 'Bow to greet'],
});

/** A valid suggest-activities recommendations JSON string. */
const VALID_ACTIVITIES_JSON = JSON.stringify({
  recommendations: [
    {
      name: 'Senso-ji Temple',
      category: 'culture',
      description: 'Ancient Buddhist temple in Asakusa.',
      address: 'Asakusa, Tokyo',
      priceRange: 'Free',
      estimatedCost: { amount: 0, per: 'person' },
      duration: 90,
      bestTime: 'Early morning',
      bookingRequired: false,
      groupFriendly: true,
      goodFor: ['families', 'solo'],
    },
  ],
});

/** A valid AI recommendations JSON array string (for recommend route). */
const VALID_RECOMMEND_JSON = JSON.stringify([
  {
    name: 'Tokyo National Museum',
    description: 'Japan\'s oldest and largest museum.',
    category: 'CULTURE',
    estimatedCost: 15,
    duration: '3 hours',
    matchScore: 88,
    matchReasons: ['Matches interest in art', 'Popular with cultural travelers'],
  },
]);

/** A minimal user row for the recommend route. */
const MOCK_USER_ROW = {
  id: MOCK_USER_ID,
  name: 'AI Tester',
  email: 'ai@test.com',
  preferences: { interests: ['art', 'food'], travelStyle: 'cultural' },
  savedActivities: [],
  tripMemberships: [],
  activityRatings: [],
};

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------
function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Do NOT use vi.resetAllMocks() here — the @/lib/ai/client factory sets
  // checkRateLimit: vi.fn(() => true) and vi.resetAllMocks() would clear it.
  // Instead each test sets its own mockReturnValueOnce / mockResolvedValueOnce.
});

// ===========================================================================
// POST /api/ai/generate-itinerary — Error Handling & Edge Cases
// ===========================================================================
describe('POST /api/ai/generate-itinerary — error handling', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 503 when AI service is not configured (OPENAI_API_KEY missing)
  // -------------------------------------------------------------------------
  it('returns 503 when AI service is not configured', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(false);

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.error).toContain('OPENAI_API_KEY');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 429 when rate limited
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({ 'X-RateLimit-Remaining': '0' });

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toContain('Rate limit exceeded');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when tripId is missing from body
  // -------------------------------------------------------------------------
  it('returns 400 when tripId is missing from body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      {} // no tripId
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  // -------------------------------------------------------------------------
  // 5. Returns 404 when trip does not exist
  // -------------------------------------------------------------------------
  it('returns 404 when trip does not exist in the database', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toContain('Trip not found');
  });

  // -------------------------------------------------------------------------
  // 6. Returns 403 when user is not a trip member
  // -------------------------------------------------------------------------
  it('returns 403 when user is not a member of the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    // Trip has a different member — current user is NOT in the list
    const tripWithOtherMember = {
      ...MOCK_TRIP,
      members: [
        {
          userId: 'clh7nz5vr0099mg0hb9gkfother',
          user: {
            id: 'clh7nz5vr0099mg0hb9gkfother',
            name: 'Other User',
            preferences: {},
          },
        },
      ],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      tripWithOtherMember as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toContain('Not authorized');
  });

  // -------------------------------------------------------------------------
  // 7. Returns 502 when AI response does not match expected schema
  // -------------------------------------------------------------------------
  it('returns 502 when AI response JSON does not match itinerary schema', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);

    // AI returns JSON that is structurally wrong (missing required fields)
    const malformedItinerary = JSON.stringify({
      overview: 'Nice trip',
      // days array is missing — schema requires it
      budgetBreakdown: { accommodation: 100, food: 50, activities: 30, transport: 20, total: 200 },
      packingTips: [],
      localTips: [],
    });
    mockGenerateText.mockResolvedValueOnce(
      { text: malformedItinerary } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(502);
    expect(body.error).toBe('Invalid AI response format');
  });

  // -------------------------------------------------------------------------
  // 8. Returns 500 when AI response is not parseable JSON
  // -------------------------------------------------------------------------
  it('returns 500 when AI response contains no JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    // AI returns plain text with no JSON object
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Sorry, I cannot generate an itinerary right now.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to parse AI response');
  });

  // -------------------------------------------------------------------------
  // 9. Returns 500 when AI provider throws (upstream unavailable)
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws (AI provider unavailable)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI API error: 503 Service Unavailable'));

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to generate itinerary');
  });

  // -------------------------------------------------------------------------
  // 10. Returns 500 when the DB transaction fails after successful AI call
  // -------------------------------------------------------------------------
  it('returns 500 when the DB transaction fails after AI generates the itinerary', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: VALID_ITINERARY_JSON } as unknown as Awaited<ReturnType<typeof generateText>>
    );
    // $transaction throws a DB error
    mockPrismaTransaction.mockRejectedValueOnce(new Error('DB connection timeout'));

    const req = makeRequest(
      'http://localhost/api/ai/generate-itinerary',
      { tripId: VALID_CUID }
    );
    const res = await postItinerary(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to generate itinerary');
  });
});

// ===========================================================================
// POST /api/ai/suggest-activities — Error Handling & Edge Cases
// ===========================================================================
describe('POST /api/ai/suggest-activities — error handling', () => {
  // -------------------------------------------------------------------------
  // 11. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 12. Returns 503 when AI service is not configured
  // -------------------------------------------------------------------------
  it('returns 503 when OPENAI_API_KEY is not configured', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(false);

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.error).toContain('OPENAI_API_KEY');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 13. Returns 429 when rate limited
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({ 'X-RateLimit-Remaining': '0' });

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toContain('Rate limit exceeded');
  });

  // -------------------------------------------------------------------------
  // 14. Returns 400 when destination is missing
  // -------------------------------------------------------------------------
  it('returns 400 when destination is missing from body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      {} // no destination
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  // -------------------------------------------------------------------------
  // 15. Returns 502 when AI response schema does not match
  // -------------------------------------------------------------------------
  it('returns 502 when AI response JSON does not match activity schema', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);

    // AI returns JSON with wrong shape — array instead of { recommendations: [...] }
    const wrongShape = JSON.stringify({ activities: [{ name: 'Sushi', category: 'food' }] });
    mockGenerateText.mockResolvedValueOnce(
      { text: wrongShape } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(502);
    expect(body.error).toBe('Invalid AI response format');
  });

  // -------------------------------------------------------------------------
  // 16. Returns 200 with empty activities when AI returns empty recommendations
  // -------------------------------------------------------------------------
  it('returns 200 with empty activities array when AI returns empty recommendations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);

    const emptyRecommendations = JSON.stringify({ recommendations: [] });
    mockGenerateText.mockResolvedValueOnce(
      { text: emptyRecommendations } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toEqual([]);
    expect(body.data.events).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 17. Returns 200 with structured suggestions even when localEvents is absent
  // -------------------------------------------------------------------------
  it('returns 200 with events defaulting to empty array when AI omits localEvents', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);

    // AI returns recommendations but no localEvents field
    const recsOnly = JSON.stringify({
      recommendations: [
        {
          name: 'Senso-ji Temple',
          category: 'culture',
          description: 'Ancient temple.',
          address: 'Asakusa, Tokyo',
          priceRange: 'Free',
          estimatedCost: { amount: 0, per: 'person' },
          duration: 90,
          bestTime: 'Morning',
          bookingRequired: false,
          groupFriendly: true,
          goodFor: ['families'],
        },
      ],
      // localEvents intentionally omitted
    });
    mockGenerateText.mockResolvedValueOnce(
      { text: recsOnly } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.activities[0].name).toBe('Senso-ji Temple');
    expect(body.data.events).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 18. Returns 500 when AI provider throws
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws for suggest-activities', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('Connection refused'));

    const req = makeRequest(
      'http://localhost/api/ai/suggest-activities',
      { destination: 'Tokyo' }
    );
    const res = await postSuggest(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to generate activity suggestions');
  });
});

// ===========================================================================
// POST /api/ai/recommend — Error Handling & Edge Cases
// ===========================================================================
describe('POST /api/ai/recommend — error handling', () => {
  // -------------------------------------------------------------------------
  // 19. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      { destination: 'Tokyo' }
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 20. Returns 429 when in-memory rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when the legacy in-memory rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClientRateLimit.mockReturnValueOnce(false); // legacy rate limit returns boolean

    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      { destination: 'Tokyo' }
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toBe('Rate limit exceeded');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 21. Returns 200 with empty recommendations when user has no trip history
  // -------------------------------------------------------------------------
  it('returns 200 gracefully when user has 0 trips in history', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClientRateLimit.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);

    // User row with no memberships, no saved activities, no ratings
    const userWithNoHistory = {
      ...MOCK_USER_ROW,
      savedActivities: [],
      tripMemberships: [],
      activityRatings: [],
    };
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      userWithNoHistory as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: VALID_RECOMMEND_JSON } as unknown as Awaited<ReturnType<typeof generateText>>
    );
    // No destination — route skips the activity.findMany call
    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      { preferences: { interests: [], budget: 'moderate' } } // no destination
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.recommendations)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 22. Returns 200 with empty recommendations when AI returns non-JSON text
  // -------------------------------------------------------------------------
  it('returns 200 with empty recommendations when AI returns non-parseable text', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClientRateLimit.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );

    // AI returns plain prose — no JSON array
    mockGenerateText.mockResolvedValueOnce(
      { text: 'I recommend visiting the Tokyo National Museum. It is wonderful.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      {} // no destination
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    // Route gracefully degrades — returns 200 with empty recommendations array
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 23. Returns 400 when limit exceeds maximum
  // -------------------------------------------------------------------------
  it('returns 400 when limit exceeds maximum allowed value of 20', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClientRateLimit.mockReturnValueOnce(true);

    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      { destination: 'Tokyo', limit: 99 } // limit max is 20
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  // -------------------------------------------------------------------------
  // 24. Returns 200 — recommend merges DB activities with AI recommendations
  // -------------------------------------------------------------------------
  it('returns 200 with merged DB and AI recommendations when destination provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockClientRateLimit.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: VALID_RECOMMEND_JSON } as unknown as Awaited<ReturnType<typeof generateText>>
    );
    // DB has one local activity for the destination
    const mockDbActivity = {
      id: 'act-001',
      name: 'Ueno Zoo',
      description: 'Popular zoo in Ueno Park.',
      category: 'ENTERTAINMENT',
      cost: 10,
      duration: 120,
      isPublic: true,
      ratings: [{ score: 4 }, { score: 5 }],
      _count: { savedBy: 42, comments: 17 },
    };
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [mockDbActivity] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makeRequest(
      'http://localhost/api/ai/recommend',
      { destination: 'Tokyo' }
    );
    const res = await postRecommend(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // DB activity (fromDatabase: true) comes first, then AI
    expect(body.data.recommendations.length).toBeGreaterThanOrEqual(1);
    const dbRec = body.data.recommendations.find(
      (r: { fromDatabase?: boolean }) => r.fromDatabase === true
    );
    expect(dbRec).toBeDefined();
    expect(dbRec.name).toBe('Ueno Zoo');
    expect(dbRec.engagement.avgRating).toBeCloseTo(4.5);
  });
});
