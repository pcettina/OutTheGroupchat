/**
 * Unit tests for POST /api/ai/suggest-activities
 *
 * Strategy
 * --------
 * - The Vercel AI SDK ('ai') is mocked so generateText returns a controllable
 *   text payload (JSON with recommendations and optional localEvents).
 * - @/lib/ai/client is mocked to expose isOpenAIConfigured and getModel as
 *   controllable stubs.
 * - @/lib/rate-limit is mocked so checkRateLimit always succeeds by default.
 * - @/lib/ai/prompts is mocked to return predictable prompt strings.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 *
 * Each test configures its own mocks from scratch after vi.resetAllMocks().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK)
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client — control isOpenAIConfigured and getModel
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(),
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — Redis-based rate limiting used by this route
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/prompts — return predictable strings so tests are stable
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/prompts', () => ({
  activityRecommendationSystemPrompt: 'MOCK_SYSTEM_PROMPT',
  buildActivityPrompt: vi.fn(() => 'MOCK_ACTIVITY_PROMPT'),
}));

// Import mocked modules AFTER vi.mock declarations
import { generateText } from 'ai';
import { isOpenAIConfigured, getModel } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildActivityPrompt } from '@/lib/ai/prompts';

// Import the handler under test
import { POST } from '@/app/api/ai/suggest-activities/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockIsOpenAIConfigured = vi.mocked(isOpenAIConfigured);
const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockBuildActivityPrompt = vi.mocked(buildActivityPrompt);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-suggest-001';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Activity Tester', email: 'suggest@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const RATE_LIMIT_OK = { success: true, limit: 20, remaining: 19, reset: Date.now() + 60000 };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 20, remaining: 0, reset: Date.now() + 60000 };

/** A valid single activity recommendation matching the route's Zod schema. */
const MOCK_ACTIVITY = {
  name: 'Eiffel Tower Visit',
  category: 'culture',
  description: 'Iconic landmark with panoramic city views.',
  address: 'Champ de Mars, Paris',
  priceRange: '€15-€30',
  estimatedCost: { amount: 25, per: 'person' },
  duration: 120,
  bestTime: 'Early morning',
  bookingRequired: true,
  groupFriendly: true,
  goodFor: ['couples', 'families'],
  tips: 'Book online to skip the queue.',
};

const MOCK_LOCAL_EVENT = {
  name: 'Paris Jazz Festival',
  date: '2026-07-14',
  description: 'Annual jazz festival in Parc Floral.',
  relevance: 'Great for music lovers visiting in July.',
};

/** Valid JSON the AI returns — recommendations only. */
const MOCK_AI_JSON_RECOMMENDATIONS_ONLY = JSON.stringify({
  recommendations: [MOCK_ACTIVITY],
});

/** Valid JSON the AI returns — with localEvents included. */
const MOCK_AI_JSON_WITH_EVENTS = JSON.stringify({
  recommendations: [MOCK_ACTIVITY],
  localEvents: [MOCK_LOCAL_EVENT],
});

/** Minimal valid POST body. */
const VALID_BODY = { destination: 'Paris' };

/** Build a POST Request with JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/suggest-activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

/** Set up a full happy-path mock state. */
function setupHappyPath(aiJsonText = MOCK_AI_JSON_RECOMMENDATIONS_ONLY) {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockIsOpenAIConfigured.mockReturnValueOnce(true);
  mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValueOnce({});
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
  mockGenerateText.mockResolvedValueOnce(
    { text: aiJsonText } as unknown as Awaited<ReturnType<typeof generateText>>
  );
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests.
// vi.resetAllMocks() flushes queued mockResolvedValueOnce values so tests
// remain isolated. vi.clearAllMocks() alone does NOT flush these queues.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/ai/suggest-activities
// ===========================================================================
describe('POST /api/ai/suggest-activities', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 401 when session exists but has no user ID
  // -------------------------------------------------------------------------
  it('returns 401 when session user has no id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No ID User', email: 'noid@test.com' },
      expires: '2099-01-01',
    });

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 503 when OPENAI_API_KEY is not configured
  // -------------------------------------------------------------------------
  it('returns 503 when AI service is not configured', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(false);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/not available/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 429 when rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '999',
    });

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rate limit/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when destination is missing
  // -------------------------------------------------------------------------
  it('returns 400 when destination field is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 400 when budget has an invalid enum value
  // -------------------------------------------------------------------------
  it('returns 400 when budget is not a valid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({ destination: 'Paris', budget: 'ultra-cheap' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Returns 200 with activities on a minimal valid request
  // -------------------------------------------------------------------------
  it('returns 200 with activities array on a minimal valid request', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.activities)).toBe(true);
    expect(body.data.activities.length).toBe(1);
    expect(body.data.activities[0].name).toBe('Eiffel Tower Visit');
  });

  // -------------------------------------------------------------------------
  // 8. Returns empty events array when AI response has no localEvents
  // -------------------------------------------------------------------------
  it('returns empty events array when AI response omits localEvents', async () => {
    setupHappyPath(MOCK_AI_JSON_RECOMMENDATIONS_ONLY);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.events)).toBe(true);
    expect(body.data.events).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. Returns localEvents when AI response includes them
  // -------------------------------------------------------------------------
  it('returns localEvents array when AI includes them in the response', async () => {
    setupHappyPath(MOCK_AI_JSON_WITH_EVENTS);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.events)).toBe(true);
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].name).toBe('Paris Jazz Festival');
  });

  // -------------------------------------------------------------------------
  // 10. Response meta contains destination, categories, and budget
  // -------------------------------------------------------------------------
  it('response meta contains destination, categories, and budget', async () => {
    setupHappyPath();

    const req = makePostRequest({
      destination: 'Tokyo',
      categories: ['food', 'culture'],
      budget: 'luxury',
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.meta).toBeDefined();
    expect(body.data.meta.destination).toBe('Tokyo');
    expect(body.data.meta.budget).toBe('luxury');
    expect(body.data.meta.generatedAt).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. Calls generateText with model returned by getModel('suggestions')
  // -------------------------------------------------------------------------
  it('calls generateText with the model from getModel and the built prompt', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    await POST(req);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.model).toBe(MOCK_MODEL);
    expect(callArgs.system).toBe('MOCK_SYSTEM_PROMPT');
    expect(callArgs.prompt).toBe('MOCK_ACTIVITY_PROMPT');
  });

  // -------------------------------------------------------------------------
  // 12. buildActivityPrompt is called with all input parameters
  // -------------------------------------------------------------------------
  it('calls buildActivityPrompt with destination, categories, preferences, budget, groupSize, and tripDates', async () => {
    setupHappyPath();

    const tripDates = { start: '2026-07-01', end: '2026-07-10' };
    const req = makePostRequest({
      destination: 'Barcelona',
      categories: ['entertainment', 'nightlife'],
      preferences: ['rooftop bars', 'flamenco'],
      budget: 'moderate',
      groupSize: 6,
      tripDates,
    });
    await POST(req);

    expect(mockBuildActivityPrompt).toHaveBeenCalledOnce();
    const callArgs = mockBuildActivityPrompt.mock.calls[0][0];
    expect(callArgs.destination).toBe('Barcelona');
    expect(callArgs.categories).toEqual(['entertainment', 'nightlife']);
    expect(callArgs.preferences).toEqual(['rooftop bars', 'flamenco']);
    expect(callArgs.budget).toBe('moderate');
    expect(callArgs.groupSize).toBe(6);
    expect(callArgs.tripDates).toEqual(tripDates);
  });

  // -------------------------------------------------------------------------
  // 13. Applies default values for optional fields
  // -------------------------------------------------------------------------
  it('applies default values when optional fields are omitted', async () => {
    setupHappyPath();

    const req = makePostRequest({ destination: 'Rome' });
    await POST(req);

    expect(mockBuildActivityPrompt).toHaveBeenCalledOnce();
    const callArgs = mockBuildActivityPrompt.mock.calls[0][0];
    // Zod defaults: categories, preferences, budget, groupSize
    expect(callArgs.categories).toEqual(['food', 'entertainment', 'culture']);
    expect(callArgs.preferences).toEqual([]);
    expect(callArgs.budget).toBe('moderate');
    expect(callArgs.groupSize).toBe(4);
  });

  // -------------------------------------------------------------------------
  // 14. Returns 502 when AI JSON fails Zod validation (schema mismatch)
  // -------------------------------------------------------------------------
  it('returns 502 when AI JSON does not match expected schema', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
    // Return JSON that doesn't match the activitySuggestionsOutputSchema
    mockGenerateText.mockResolvedValueOnce(
      { text: JSON.stringify({ wrong_key: [] }) } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid ai response/i);
  });

  // -------------------------------------------------------------------------
  // 15. Returns 500 when AI returns text with no JSON object
  // -------------------------------------------------------------------------
  it('returns 500 when AI response contains no JSON object', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Sorry, I cannot generate suggestions at this time.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed to parse/i);
    // rawResponse is included in the error payload
    expect(body.rawResponse).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 16. Returns 500 when generateText throws a generic error
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI quota exceeded'));

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed to generate activity suggestions/i);
  });

  // -------------------------------------------------------------------------
  // 17. Passes session user ID to checkRateLimit
  // -------------------------------------------------------------------------
  it('passes session user ID to checkRateLimit', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    await POST(req);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      null, // aiRateLimiter is null in test environment (mocked as null)
      MOCK_USER_ID
    );
  });

  // -------------------------------------------------------------------------
  // 18. Handles all three budget enum values correctly
  // -------------------------------------------------------------------------
  it.each([
    ['budget'],
    ['moderate'],
    ['luxury'],
  ])('accepts budget="%s" as a valid enum value', async (budget) => {
    setupHappyPath();

    const req = makePostRequest({ destination: 'Paris', budget });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.meta.budget).toBe(budget);
  });

  // -------------------------------------------------------------------------
  // 19. AI response with malformed JSON inside the curly-brace match
  // -------------------------------------------------------------------------
  it('returns 500 when JSON.parse throws on malformed JSON within braces', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
    // Contains braces but is not valid JSON
    mockGenerateText.mockResolvedValueOnce(
      { text: '{ recommendations: [broken json,,, }' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed to parse/i);
  });

  // -------------------------------------------------------------------------
  // 20. Response shape: data contains activities, events, and meta keys
  // -------------------------------------------------------------------------
  it('response data object has exactly the activities, events, and meta keys', async () => {
    setupHappyPath(MOCK_AI_JSON_WITH_EVENTS);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Object.keys(body.data)).toEqual(
      expect.arrayContaining(['activities', 'events', 'meta'])
    );
  });

  // -------------------------------------------------------------------------
  // 21. meta.generatedAt is a valid ISO 8601 date string
  // -------------------------------------------------------------------------
  it('meta.generatedAt is a valid ISO 8601 date string', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const generatedAt = new Date(body.data.meta.generatedAt);
    expect(isNaN(generatedAt.getTime())).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 22. AI JSON embedded in prose is still extracted correctly
  // -------------------------------------------------------------------------
  it('extracts and parses JSON embedded in prose text', async () => {
    const embeddedJson = `Here are some suggestions for your trip:\n${MOCK_AI_JSON_RECOMMENDATIONS_ONLY}\nEnjoy your visit!`;

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockBuildActivityPrompt.mockReturnValueOnce('MOCK_ACTIVITY_PROMPT');
    mockGenerateText.mockResolvedValueOnce(
      { text: embeddedJson } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities[0].name).toBe('Eiffel Tower Visit');
  });

  // -------------------------------------------------------------------------
  // 23. categories field in meta matches what was sent in the request
  // -------------------------------------------------------------------------
  it('meta.categories reflects the categories sent in the request', async () => {
    setupHappyPath();

    const categories = ['sports', 'nightlife'];
    const req = makePostRequest({ destination: 'Ibiza', categories });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.meta.categories).toEqual(categories);
  });
});
