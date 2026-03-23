/**
 * Unit tests for POST /api/ai/recommend
 *
 * Strategy
 * --------
 * - The Vercel AI SDK ('ai') is mocked so generateText returns a controllable
 *   text payload (JSON array of recommendations).
 * - @/lib/ai/client is mocked to expose checkRateLimit (legacy in-memory) and
 *   getModel as controllable stubs.
 * - @/lib/prisma is mocked via setup.ts; individual test cases set up their
 *   own mockResolvedValueOnce calls.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 *
 * Each test configures its own mocks from scratch after vi.resetAllMocks().
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
// Mock: @/lib/ai/client — control checkRateLimit (legacy) and getModel
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(() => true),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(() => true), // legacy in-memory returns boolean
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

import { generateText } from 'ai';
import { getModel, checkRateLimit as checkRateLimitClient } from '@/lib/ai/client';
import { POST } from '@/app/api/ai/recommend/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);
const mockGetModel = vi.mocked(getModel);
const mockCheckRateLimitClient = vi.mocked(checkRateLimitClient);
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaActivity = vi.mocked(prisma.activity);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-ai-rec-001';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Rec Tester', email: 'rec@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

/** A single valid recommendation in the format the AI should return. */
const MOCK_AI_RECOMMENDATION = {
  name: 'Eiffel Tower Visit',
  description: 'Iconic Parisian landmark with stunning views.',
  category: 'CULTURE',
  estimatedCost: 28,
  duration: '2-3 hours',
  matchScore: 92,
  matchReasons: ['Matches interest in landmarks', 'Popular with groups'],
};

/** JSON text the AI would return. */
const MOCK_AI_JSON_TEXT = JSON.stringify([MOCK_AI_RECOMMENDATION]);

/** Minimal prisma.user row returned by findUnique in the recommend route. */
const MOCK_USER_ROW = {
  id: MOCK_USER_ID,
  name: 'Rec Tester',
  email: 'rec@test.com',
  preferences: { interests: ['history', 'food'], travelStyle: 'cultural' },
  savedActivities: [],
  tripMemberships: [],
  activityRatings: [],
};

/** Build a POST Request with JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

/**
 * Set up a full happy-path mock state.
 * @param withDestination - When true (default), also mocks activity.findMany
 * since a destination is provided and the route queries the DB for local activities.
 */
function setupHappyPath(withDestination = true) {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockCheckRateLimitClient.mockReturnValueOnce(true);
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockPrismaUser.findUnique.mockResolvedValueOnce(
    MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
  );
  mockGenerateText.mockResolvedValueOnce(
    { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
  );
  if (withDestination) {
    // When destination is set the route also queries prisma.activity.findMany
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
  }
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests.
// vi.resetAllMocks() is used (superset of clearAllMocks) to flush queued
// mockResolvedValueOnce/mockReturnValueOnce values so tests remain isolated.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/ai/recommend
// ===========================================================================
describe('POST /api/ai/recommend', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 429 when rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(false);

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/rate limit/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 400 when limit exceeds maximum allowed (>20)
  // -------------------------------------------------------------------------
  it('returns 400 when limit exceeds 20 (Zod max constraint)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);

    const req = makePostRequest({ destination: 'Paris', limit: 99 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when limit is below minimum (< 1)
  // -------------------------------------------------------------------------
  it('returns 400 when limit is less than 1 (Zod min constraint)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);

    const req = makePostRequest({ destination: 'Paris', limit: 0 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when budget is not a valid enum value
  // -------------------------------------------------------------------------
  it('returns 400 when preferences.budget is an invalid value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);

    const req = makePostRequest({
      destination: 'Paris',
      preferences: { budget: 'super-cheap' },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 200 with recommendations on a valid request
  // -------------------------------------------------------------------------
  it('returns 200 with recommendations array on valid request', async () => {
    setupHappyPath();

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.recommendations)).toBe(true);
    expect(body.data.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(body.data.recommendations[0].name).toBe('Eiffel Tower Visit');
  });

  // -------------------------------------------------------------------------
  // 7. Correctly passes context data to generateText (prompt construction)
  // -------------------------------------------------------------------------
  it('constructs the AI prompt using destination and preferences', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({
      destination: 'Tokyo',
      preferences: {
        interests: ['anime', 'food'],
        budget: 'budget',
        travelStyle: 'adventure',
        groupSize: 3,
      },
    });
    await POST(req);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Tokyo');
    expect(callArgs.prompt).toContain('anime');
    expect(callArgs.prompt).toContain('budget');
    expect(callArgs.prompt).toContain('adventure');
    expect(callArgs.prompt).toContain('3');
  });

  // -------------------------------------------------------------------------
  // 8. Returns 200 with empty recommendations when AI returns invalid JSON
  // -------------------------------------------------------------------------
  it('returns 200 with empty recommendations when AI returns unparseable text', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: 'I cannot generate recommendations right now.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 9. Returns 500 when generateText throws
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI quota exceeded'));

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to generate recommendations/i);
  });

  // -------------------------------------------------------------------------
  // 10. Returns 500 when Prisma user.findUnique throws
  // -------------------------------------------------------------------------
  it('returns 500 when prisma user.findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to generate recommendations/i);
  });

  // -------------------------------------------------------------------------
  // 11. Merges database activities when destination is provided
  // -------------------------------------------------------------------------
  it('merges database activities into recommendations when destination is set', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimitClient.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_ROW as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const dbActivity = {
      id: 'act-db-001',
      name: 'Louvre Museum',
      description: 'World-famous art museum.',
      category: 'CULTURE',
      cost: 20,
      duration: 180,
      isPublic: true,
      ratings: [{ score: 5 }, { score: 4 }],
      _count: { savedBy: 50, comments: 12 },
    };
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [dbActivity] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // DB activities are prepended — find the DB one
    const dbRec = body.data.recommendations.find(
      (r: { name: string }) => r.name === 'Louvre Museum'
    );
    expect(dbRec).toBeDefined();
    expect(dbRec.fromDatabase).toBe(true);
    expect(dbRec.engagement.saves).toBe(50);
    expect(dbRec.engagement.avgRating).toBeCloseTo(4.5);
  });

  // -------------------------------------------------------------------------
  // 12. Returns context object with personalized flag
  // -------------------------------------------------------------------------
  it('returns context object with destination and personalized flag', async () => {
    setupHappyPath();

    const req = makePostRequest({ destination: 'Paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.context).toBeDefined();
    expect(body.data.context.destination).toBe('Paris');
    // User was found so personalized should be true
    expect(body.data.context.personalized).toBe(true);
  });
});
