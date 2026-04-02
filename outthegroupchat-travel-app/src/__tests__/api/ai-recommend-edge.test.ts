/**
 * Edge case tests for /api/ai/recommend (POST and GET)
 *
 * Strategy
 * --------
 * Covers scenarios NOT present in ai-recommend.test.ts:
 *   - All preference fields populated
 *   - Empty / omitted preferences
 *   - Invalid JSON body (400)
 *   - Limit boundary values (1 and 20 — both valid)
 *   - Invalid travelStyle enum
 *   - No destination provided (DB activity lookup skipped)
 *   - User not found (null) → personalized: false
 *   - AI returns schema-invalid items → recommendations empty
 *   - AI returns text with preamble wrapping the JSON array
 *   - limit causes slice of merged results
 *   - GET: 401 unauthenticated
 *   - GET: missing tripId → 400
 *   - GET: invalid limit string → 400
 *   - GET: tripId not found → 404
 *   - GET: 500 on Prisma throw
 *   - GET: happy path returns recommendations and groupInterests
 *   - GET: default limit (no limit query param) defaults to 8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK)
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(() => true),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

import { generateText } from 'ai';
import { getModel, checkRateLimit as checkRateLimitClient } from '@/lib/ai/client';
import { POST, GET } from '@/app/api/ai/recommend/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);
const mockGetModel = vi.mocked(getModel);
const mockCheckRateLimitClient = vi.mocked(checkRateLimitClient);
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaTrip = vi.mocked(prisma.trip);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-edge-rec-001';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Edge Tester', email: 'edge@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const MOCK_AI_RECOMMENDATION = {
  name: 'Eiffel Tower Visit',
  description: 'Iconic Parisian landmark with stunning views.',
  category: 'CULTURE',
  estimatedCost: 28,
  duration: '2-3 hours',
  matchScore: 92,
  matchReasons: ['Matches interest in landmarks'],
};

const MOCK_AI_JSON_TEXT = JSON.stringify([MOCK_AI_RECOMMENDATION]);

const MOCK_USER_ROW = {
  id: MOCK_USER_ID,
  name: 'Edge Tester',
  email: 'edge@test.com',
  preferences: { interests: ['history', 'food'], travelStyle: 'cultural' },
  savedActivities: [],
  tripMemberships: [],
  activityRatings: [],
};

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePostRequestRaw(rawBody: string): Request {
  return new Request('http://localhost:3000/api/ai/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

function makeGetRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/ai/recommend');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: 'GET' });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/ai/recommend — edge cases
// ===========================================================================
describe('POST /api/ai/recommend — edge cases', () => {
  // -------------------------------------------------------------------------
  // 1. All preference fields populated
  // -------------------------------------------------------------------------
  it('succeeds with all preference fields fully populated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );
    // destination provided → DB activities query fires
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({
      destination: 'Tokyo',
      preferences: {
        interests: ['ramen', 'anime', 'temples', 'markets'],
        budget: 'luxury',
        travelStyle: 'cultural',
        groupSize: 6,
      },
      limit: 5,
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify preferences were forwarded to the prompt
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('ramen');
    expect(callArgs.prompt).toContain('luxury');
    expect(callArgs.prompt).toContain('cultural');
    expect(callArgs.prompt).toContain('6');
  });

  // -------------------------------------------------------------------------
  // 2. Empty preferences object — should succeed (all fields optional)
  // -------------------------------------------------------------------------
  it('succeeds when preferences is an empty object', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    // No destination → no DB activity query
    const req = makePostRequest({ preferences: {} });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.recommendations)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Preferences omitted entirely — should succeed
  // -------------------------------------------------------------------------
  it('succeeds when preferences field is omitted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Invalid JSON body → 400
  // -------------------------------------------------------------------------
  it('returns 400 when request body is not valid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);

    const req = makePostRequestRaw('{ this is not valid json }');
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. limit = 1 (minimum boundary — valid)
  // -------------------------------------------------------------------------
  it('accepts limit = 1 (minimum boundary)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({ limit: 1 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Generate 1');
  });

  // -------------------------------------------------------------------------
  // 6. limit = 20 (maximum boundary — valid)
  // -------------------------------------------------------------------------
  it('accepts limit = 20 (maximum boundary)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({ limit: 20 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Invalid travelStyle enum → 400
  // -------------------------------------------------------------------------
  it('returns 400 when preferences.travelStyle is not a valid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);

    const req = makePostRequest({
      destination: 'Paris',
      preferences: { travelStyle: 'extreme-sports' },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. No destination provided — skips DB activity lookup
  // -------------------------------------------------------------------------
  it('does not query prisma.activity when no destination is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({ preferences: { budget: 'moderate' } });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockPrismaActivity.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. User not found (null) — context.personalized should be false
  // -------------------------------------------------------------------------
  it('returns personalized: false when user is not found in the database', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.context.personalized).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. AI returns schema-invalid items (missing required fields) → empty array
  // -------------------------------------------------------------------------
  it('returns empty recommendations when AI JSON items fail schema validation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    // Items missing required fields (no category, no matchScore, etc.)
    const badItems = JSON.stringify([
      { name: 'Bad Activity', description: 'Incomplete item' },
    ]);
    mockGenerateText.mockResolvedValueOnce(
      { text: badItems } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 11. AI returns preamble text wrapping the JSON array — should still parse
  // -------------------------------------------------------------------------
  it('extracts JSON array from AI text that contains surrounding prose', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );

    const textWithPreamble = `Here are your recommendations:\n${MOCK_AI_JSON_TEXT}\nEnjoy your trip!`;
    mockGenerateText.mockResolvedValueOnce(
      { text: textWithPreamble } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(body.data.recommendations[0].name).toBe('Eiffel Tower Visit');
  });

  // -------------------------------------------------------------------------
  // 12. Limit slices merged results — DB activities + AI recommendations
  // -------------------------------------------------------------------------
  it('slices merged recommendations to the requested limit', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );

    // 3 valid AI recommendations
    const threeRecs = [
      { ...MOCK_AI_RECOMMENDATION, name: 'Rec 1' },
      { ...MOCK_AI_RECOMMENDATION, name: 'Rec 2' },
      { ...MOCK_AI_RECOMMENDATION, name: 'Rec 3' },
    ];
    mockGenerateText.mockResolvedValueOnce(
      { text: JSON.stringify(threeRecs) } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    // 3 DB activities
    const buildDbActivity = (n: number) => ({
      id: `act-db-00${n}`,
      name: `DB Activity ${n}`,
      description: 'DB activity.',
      category: 'CULTURE',
      cost: 15,
      duration: 60,
      isPublic: true,
      ratings: [],
      _count: { savedBy: 5, comments: 2 },
    });
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [buildDbActivity(1), buildDbActivity(2), buildDbActivity(3)] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    // Request limit = 2 → merged [3 DB, 3 AI] sliced to 2
    const req = makePostRequest({ destination: 'Paris', limit: 2 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations.length).toBe(2);
  });
});

// ===========================================================================
// GET /api/ai/recommend — edge cases
// ===========================================================================
describe('GET /api/ai/recommend — edge cases', () => {
  // -------------------------------------------------------------------------
  // 13. Returns 401 when GET is unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session on GET', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 14. Returns 400 when tripId is missing on GET
  // -------------------------------------------------------------------------
  it('returns 400 when tripId query param is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeGetRequest({});
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 15. Returns 400 when limit query param is non-numeric
  // -------------------------------------------------------------------------
  it('returns 400 when limit query param is not a valid number string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0', limit: 'abc' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
  });

  // -------------------------------------------------------------------------
  // 16. Returns 404 when trip is not found
  // -------------------------------------------------------------------------
  it('returns 404 when the tripId does not match any trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/trip not found/i);
  });

  // -------------------------------------------------------------------------
  // 17. Returns 500 when prisma.trip.findUnique throws
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.trip.findUnique throws on GET', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to get recommendations/i);
  });

  // -------------------------------------------------------------------------
  // 18. Happy path GET — returns recommendations and groupInterests
  // -------------------------------------------------------------------------
  it('returns recommendations and groupInterests on a valid GET request', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockTrip = {
      id: 'clh7nz5vr0000mg0hb9gkfxe0',
      destination: { city: 'Barcelona' },
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-10'),
      members: [
        {
          user: {
            preferences: { interests: ['art', 'tapas'] },
          },
        },
        {
          user: {
            preferences: { interests: ['art', 'beach'] },
          },
        },
      ],
      activities: [],
      survey: null,
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0', limit: '5' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tripId).toBe('clh7nz5vr0000mg0hb9gkfxe0');
    expect(body.data.destination).toBe('Barcelona');
    expect(Array.isArray(body.data.recommendations)).toBe(true);
    expect(Array.isArray(body.data.groupInterests)).toBe(true);
    // 'art' appears for both members → should rank highest
    expect(body.data.groupInterests[0]).toBe('art');
  });

  // -------------------------------------------------------------------------
  // 19. GET with no limit param — defaults to 8
  // -------------------------------------------------------------------------
  it('uses default limit of 8 when limit query param is omitted on GET', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockTrip = {
      id: 'clh7nz5vr0000mg0hb9gkfxe0',
      destination: { city: 'Rome' },
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-08'),
      members: [],
      activities: [],
      survey: null,
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify prompt says "Generate 8"
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Generate 8');
  });

  // -------------------------------------------------------------------------
  // 20. GET returns empty recommendations when AI returns invalid JSON
  // -------------------------------------------------------------------------
  it('returns empty recommendations array when AI returns unparseable text on GET', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockTrip = {
      id: 'clh7nz5vr0000mg0hb9gkfxe0',
      destination: { city: 'London' },
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-07'),
      members: [],
      activities: [],
      survey: null,
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Sorry, I cannot provide recommendations at this time.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makeGetRequest({ tripId: 'clh7nz5vr0000mg0hb9gkfxe0' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toEqual([]);
  });
});
