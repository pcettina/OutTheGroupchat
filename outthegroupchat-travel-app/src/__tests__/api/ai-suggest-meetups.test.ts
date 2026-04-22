/**
 * Unit tests for POST /api/ai/suggest-meetups
 *
 * Strategy
 * --------
 * - The Vercel AI SDK ('ai') is mocked so generateText returns a controllable
 *   text payload containing a JSON array of meetup suggestions.
 * - @/lib/ai/client is mocked to expose getModel as a controllable stub.
 *   Note: suggest-meetups does NOT call isOpenAIConfigured directly; getModel
 *   will throw if the AI service is unavailable.
 * - @/lib/rate-limit is mocked so checkRateLimit always succeeds by default.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 *
 * Each test configures its own mocks after vi.resetAllMocks() to avoid leakage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK)
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client — getModel must be controllable per test
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
// Mock: @/lib/rate-limit — Redis-backed rate limiting used by this route
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// Import mocked modules AFTER vi.mock declarations (hoisting-safe order)
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// Import the handler under test
import { POST } from '@/app/api/ai/suggest-meetups/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-suggest-meetups-001';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Meetup Tester', email: 'meetup@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const RATE_LIMIT_OK = {
  success: true,
  limit: 5,
  remaining: 4,
  reset: Date.now() + 60000,
};

const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 5,
  remaining: 0,
  reset: Date.now() + 60000,
};

/** A valid MeetupSuggestion matching the route's meetupSuggestionSchema. */
const MOCK_SUGGESTION = {
  title: 'Rooftop Cocktails & City Views',
  venue_type: 'rooftop bar',
  activity: 'cocktail tasting',
  duration_minutes: 90,
  time_of_day: 'evening' as const,
  vibe: 'upscale and social',
  description: 'Enjoy craft cocktails with panoramic city views.',
};

const MOCK_SUGGESTION_2 = {
  title: 'Saturday Morning Hike',
  venue_type: 'nature trail',
  activity: 'hiking',
  duration_minutes: 120,
  time_of_day: 'morning' as const,
  vibe: 'active and chill',
  description: 'Scenic trail with great spots for group photos.',
};

/** Valid AI response: a JSON array of meetup suggestions. */
const MOCK_AI_JSON_VALID = JSON.stringify([MOCK_SUGGESTION, MOCK_SUGGESTION_2]);

/** AI response with suggestions embedded in prose text. */
const MOCK_AI_JSON_EMBEDDED = `Here are some great ideas for your crew:\n${MOCK_AI_JSON_VALID}\nHope you enjoy!`;

/** Minimal valid POST body. */
const VALID_BODY = { city: 'Austin' };

/** Build a POST NextRequest with a JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/suggest-meetups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse a Response body as JSON. */
async function parseJson(res: Response) {
  return res.json();
}

/** Configure a standard happy-path mock state. */
function setupHappyPath(aiJsonText = MOCK_AI_JSON_VALID) {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValueOnce({});
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockGenerateText.mockResolvedValueOnce(
    { text: aiJsonText } as unknown as Awaited<ReturnType<typeof generateText>>
  );
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test.
// vi.resetAllMocks() flushes mockResolvedValueOnce queues; vi.clearAllMocks()
// alone does NOT flush these queues and can cause state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/ai/suggest-meetups
// ===========================================================================
describe('POST /api/ai/suggest-meetups', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when there is no session at all
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 401 when session has no user ID
  // -------------------------------------------------------------------------
  it('returns 401 when session user has no id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No ID', email: 'noid@test.com' },
      expires: '2099-01-01',
    });

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 429 when rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(Date.now() + 60000),
    });

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/rate limit/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when city is missing
  // -------------------------------------------------------------------------
  it('returns 400 when city field is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({});
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(body.details).toBeDefined();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when city is too short (min 2 chars)
  // -------------------------------------------------------------------------
  it('returns 400 when city is a single character (fails min length)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({ city: 'A' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 400 when crewSize exceeds maximum (20)
  // -------------------------------------------------------------------------
  it('returns 400 when crewSize exceeds maximum of 20', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({ city: 'Dallas', crewSize: 25 });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Returns 400 when crewSize is below minimum (1)
  // -------------------------------------------------------------------------
  it('returns 400 when crewSize is below minimum of 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({ city: 'Houston', crewSize: 0 });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Returns 400 when request body is not valid JSON
  // -------------------------------------------------------------------------
  it('returns 400 when request body is invalid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = new Request('http://localhost:3000/api/ai/suggest-meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json ,,, }',
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. Returns 200 with suggestions array on a minimal valid request
  // -------------------------------------------------------------------------
  it('returns 200 with suggestions array on a valid minimal request', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions).toBeDefined();
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 10. Suggestion objects contain expected fields
  // -------------------------------------------------------------------------
  it('each suggestion contains all required MeetupSuggestion fields', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const suggestion = body.suggestions[0];
    expect(suggestion).toMatchObject({
      title: expect.any(String),
      venue_type: expect.any(String),
      activity: expect.any(String),
      duration_minutes: expect.any(Number),
      time_of_day: expect.stringMatching(/^(morning|afternoon|evening|late_night)$/),
      vibe: expect.any(String),
      description: expect.any(String),
    });
  });

  // -------------------------------------------------------------------------
  // 11. Optional theme field is accepted without error
  // -------------------------------------------------------------------------
  it('accepts an optional theme field alongside city without error', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'New York', theme: 'outdoor adventures' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 12. crewSize defaults to 4 when omitted
  // -------------------------------------------------------------------------
  it('calls generateText with the default crewSize of 4 when crewSize is omitted', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'Miami' });
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    // The route constructs the prompt with crewSize — default is 4
    expect(prompt).toContain('4');
  });

  // -------------------------------------------------------------------------
  // 13. crewSize is reflected in the AI prompt
  // -------------------------------------------------------------------------
  it('passes crewSize and city into the generateText prompt', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'Chicago', crewSize: 8 });
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Chicago');
    expect(prompt).toContain('8');
  });

  // -------------------------------------------------------------------------
  // 14. Theme is included in the prompt when provided
  // -------------------------------------------------------------------------
  it('includes the theme in the generateText prompt when provided', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'Seattle', theme: 'wine tasting' });
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('wine tasting');
  });

  // -------------------------------------------------------------------------
  // 15. getModel is called with 'suggestions'
  // -------------------------------------------------------------------------
  it('calls getModel with the suggestions task type', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockGetModel).toHaveBeenCalledWith('suggestions');
  });

  // -------------------------------------------------------------------------
  // 16. checkRateLimit is called with user ID keyed for this route
  // -------------------------------------------------------------------------
  it('passes the session user ID with route prefix to checkRateLimit', async () => {
    setupHappyPath();

    const req = makePostRequest(VALID_BODY);
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      null, // aiRateLimiter mocked as null
      `ai-suggest-meetups:${MOCK_USER_ID}`
    );
  });

  // -------------------------------------------------------------------------
  // 17. Returns empty suggestions array when AI response fails Zod validation
  // (graceful degradation — the route logs error but returns { suggestions: [] })
  // -------------------------------------------------------------------------
  it('returns 200 with empty suggestions when AI JSON fails schema validation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    // Response is a valid JSON array but objects lack required fields
    mockGenerateText.mockResolvedValueOnce(
      { text: JSON.stringify([{ wrong_field: 'bad data' }]) } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 18. Returns empty suggestions when AI returns non-JSON prose
  // -------------------------------------------------------------------------
  it('returns 200 with empty suggestions when AI response contains no JSON array', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Sorry, I cannot generate meetup ideas right now.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 19. Returns empty suggestions when AI returns malformed JSON inside brackets
  // -------------------------------------------------------------------------
  it('returns 200 with empty suggestions when JSON array extraction yields malformed JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: '[{broken json,,, missing fields}]' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 20. AI JSON embedded in prose is still extracted via regex
  // -------------------------------------------------------------------------
  it('extracts and parses a JSON array embedded in prose text', async () => {
    setupHappyPath(MOCK_AI_JSON_EMBEDDED);

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].title).toBe(MOCK_SUGGESTION.title);
  });

  // -------------------------------------------------------------------------
  // 21. Returns 500 when generateText throws a generic error
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI network error'));

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to generate meetup suggestions/i);
  });

  // -------------------------------------------------------------------------
  // 22. Returns 500 (via getModel throw) when OpenAI key is missing
  // getModel throws when OPENAI_API_KEY is not set; suggest-meetups has no
  // isOpenAIConfigured guard, so this surfaces as a 500.
  // -------------------------------------------------------------------------
  it('returns 500 when getModel throws due to missing OpenAI key', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockImplementationOnce(() => {
      throw new Error('AI service is not configured. Please set OPENAI_API_KEY environment variable.');
    });

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to generate meetup suggestions/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 23. captureException is called on unhandled errors
  // -------------------------------------------------------------------------
  it('calls captureException when generateText throws', async () => {
    const { captureException } = await import('@/lib/sentry');
    const mockCaptureException = vi.mocked(captureException);

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    const aiError = new Error('Unexpected AI failure');
    mockGenerateText.mockRejectedValueOnce(aiError);

    const req = makePostRequest(VALID_BODY);
    await POST(req as unknown as import('next/server').NextRequest);

    expect(mockCaptureException).toHaveBeenCalledWith(aiError);
  });

  // -------------------------------------------------------------------------
  // 24. All valid time_of_day enum values are accepted in AI response
  // -------------------------------------------------------------------------
  it.each([
    ['morning'],
    ['afternoon'],
    ['evening'],
    ['late_night'],
  ])('accepts time_of_day="%s" in AI response and includes it in suggestions', async (timeOfDay) => {
    const suggestionWithTimeOfDay = { ...MOCK_SUGGESTION, time_of_day: timeOfDay };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: JSON.stringify([suggestionWithTimeOfDay]) } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const req = makePostRequest(VALID_BODY);
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].time_of_day).toBe(timeOfDay);
  });

  // -------------------------------------------------------------------------
  // 25. crewSize boundary: 1 (minimum) is accepted
  // -------------------------------------------------------------------------
  it('accepts crewSize=1 (minimum valid value)', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'Boston', crewSize: 1 });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 26. crewSize boundary: 20 (maximum) is accepted
  // -------------------------------------------------------------------------
  it('accepts crewSize=20 (maximum valid value)', async () => {
    setupHappyPath();

    const req = makePostRequest({ city: 'Denver', crewSize: 20 });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 27. crewSize must be an integer (non-integer fails)
  // -------------------------------------------------------------------------
  it('returns 400 when crewSize is a non-integer float', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = makePostRequest({ city: 'Portland', crewSize: 3.7 });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
