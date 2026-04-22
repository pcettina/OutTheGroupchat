/**
 * Unit tests for POST /api/ai/icebreakers
 *
 * Strategy
 * --------
 * - The Vercel AI SDK ('ai') is mocked so generateText returns a controllable
 *   text payload (a JSON array of strings).
 * - @/lib/ai/client is mocked to expose getModel as a controllable stub.
 * - @/lib/rate-limit is mocked so checkRateLimit always succeeds by default.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 * - @/lib/prisma mocks (crew.findFirst, user.findUnique) are in setup.ts.
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
// Mock: @/lib/ai/client — control getModel
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

// Import mocked modules AFTER vi.mock declarations
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// Import the handler under test
import { POST } from '@/app/api/ai/icebreakers/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGetModel = vi.mocked(getModel);
const mockGenerateText = vi.mocked(generateText);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockCrewFindFirst = vi.mocked(prisma.crew.findFirst);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CALLER_ID = 'user-caller-001';
const CREW_MEMBER_ID = 'user-member-002';

const MOCK_SESSION = {
  user: { id: CALLER_ID, name: 'Alice Tester', email: 'alice@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const RATE_LIMIT_OK = {
  success: true as const,
  limit: 10,
  remaining: 9,
  reset: Date.now() + 60000,
};
const RATE_LIMIT_EXCEEDED = {
  success: false as const,
  limit: 10,
  remaining: 0,
  reset: Date.now() + 60000,
};

const MOCK_CREW_RECORD = {
  id: 'crew-abc-123',
  userAId: CALLER_ID,
  userBId: CREW_MEMBER_ID,
  status: 'ACCEPTED',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CREW_MEMBER_USER = { name: 'Bob Crewmate' };

/** Five icebreaker strings the AI returns as a JSON array. */
const MOCK_ICEBREAKERS = [
  'What is your go-to karaoke song?',
  'If you could only eat one cuisine forever, what would it be?',
  'What is the most spontaneous thing you have ever done?',
  'Beach or mountains, and why?',
  'What is a skill you have been meaning to pick up?',
];

/** Valid AI response — a JSON array of 5 strings. */
const MOCK_AI_JSON = JSON.stringify(MOCK_ICEBREAKERS);

/** Valid POST body. */
const VALID_BODY = { crewMemberId: CREW_MEMBER_ID };

/** Build a NextRequest-compatible Request with JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/icebreakers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

/** Configure all mocks for the happy path. */
function setupHappyPath(aiText = MOCK_AI_JSON) {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValueOnce({});
  mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
  mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockGenerateText.mockResolvedValueOnce(
    { text: aiText } as unknown as Awaited<ReturnType<typeof generateText>>
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
// POST /api/ai/icebreakers
// ===========================================================================
describe('POST /api/ai/icebreakers', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when there is no session
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(VALID_BODY) as never);
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

    const res = await POST(makePostRequest(VALID_BODY) as never);
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
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '999',
    });

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/rate limit/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when body is invalid JSON
  // -------------------------------------------------------------------------
  it('returns 400 when request body is not valid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const req = new Request('http://localhost:3000/api/ai/icebreakers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all {{{',
    });

    const res = await POST(req as never);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid json/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when crewMemberId is missing
  // -------------------------------------------------------------------------
  it('returns 400 when crewMemberId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const res = await POST(makePostRequest({}) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 400 when crewMemberId is an empty string
  // -------------------------------------------------------------------------
  it('returns 400 when crewMemberId is an empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});

    const res = await POST(makePostRequest({ crewMemberId: '' }) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/validation failed/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Returns 403 when no accepted Crew relationship exists
  // -------------------------------------------------------------------------
  it('returns 403 when the two users do not share an accepted Crew relationship', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/crew members/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Returns 200 with icebreakers array on a valid request
  // -------------------------------------------------------------------------
  it('returns 200 with icebreakers array on a valid authenticated request', async () => {
    setupHappyPath();

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.icebreakers)).toBe(true);
    expect(body.icebreakers).toHaveLength(5);
    expect(body.icebreakers[0]).toBe(MOCK_ICEBREAKERS[0]);
  });

  // -------------------------------------------------------------------------
  // 9. Returns empty icebreakers array when AI returns a JSON array of numbers
  // (The route regex finds the first [...] block; items must be strings.)
  // -------------------------------------------------------------------------
  it('returns empty icebreakers array when AI array contains only numbers', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    // AI returns an array of numbers — every() typeof check fails
    mockGenerateText.mockResolvedValueOnce(
      { text: '[1, 2, 3, 4, 5]' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    // Route falls back to empty array when items are not strings
    expect(res.status).toBe(200);
    expect(Array.isArray(body.icebreakers)).toBe(true);
    expect(body.icebreakers).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 10. Returns empty icebreakers when AI returns plain text with no JSON array
  // -------------------------------------------------------------------------
  it('returns empty icebreakers array when AI response contains no JSON array', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Here are some ideas! Sorry I cannot format them.' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(body.icebreakers)).toBe(true);
    expect(body.icebreakers).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 11. Returns 500 when generateText throws
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI request failed'));

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed to generate icebreakers/i);
  });

  // -------------------------------------------------------------------------
  // 12. Queries crew relationship with both orientations via OR
  // -------------------------------------------------------------------------
  it('queries prisma.crew.findFirst with OR clause covering both user orderings', async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    expect(mockCrewFindFirst).toHaveBeenCalledOnce();
    const callArgs = mockCrewFindFirst.mock.calls[0][0];
    expect(callArgs).toMatchObject({
      where: {
        OR: expect.arrayContaining([
          { userAId: CALLER_ID, userBId: CREW_MEMBER_ID },
          { userAId: CREW_MEMBER_ID, userBId: CALLER_ID },
        ]),
        status: 'ACCEPTED',
      },
    });
  });

  // -------------------------------------------------------------------------
  // 13. Fetches crew member's name via user.findUnique
  // -------------------------------------------------------------------------
  it('fetches the crew member display name using prisma.user.findUnique', async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    expect(mockUserFindUnique).toHaveBeenCalledOnce();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: CREW_MEMBER_ID },
      select: { name: true },
    });
  });

  // -------------------------------------------------------------------------
  // 14. Calls getModel with 'suggestions'
  // -------------------------------------------------------------------------
  it("calls getModel with 'suggestions'", async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    expect(mockGetModel).toHaveBeenCalledOnce();
    expect(mockGetModel).toHaveBeenCalledWith('suggestions');
  });

  // -------------------------------------------------------------------------
  // 15. Calls generateText with model from getModel
  // -------------------------------------------------------------------------
  it('passes the model returned by getModel to generateText', async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.model).toBe(MOCK_MODEL);
  });

  // -------------------------------------------------------------------------
  // 16. Prompt includes caller name and crew member name
  // -------------------------------------------------------------------------
  it('includes both caller and crew member names in the generateText prompt', async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Alice Tester');
    expect(callArgs.prompt).toContain('Bob Crewmate');
  });

  // -------------------------------------------------------------------------
  // 17. Falls back to 'your crew member' when user.findUnique returns null
  // -------------------------------------------------------------------------
  it("uses 'your crew member' as fallback name when user.findUnique returns null", async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('your crew member');
  });

  // -------------------------------------------------------------------------
  // 18. Falls back to 'someone' when session user has no name
  // -------------------------------------------------------------------------
  it("uses 'someone' as caller name fallback when session user has no name", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: CALLER_ID, email: 'anon@test.com' },
      expires: '2099-01-01',
    });
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_JSON } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain('someone');
  });

  // -------------------------------------------------------------------------
  // 19. checkRateLimit is called with caller's user ID
  // -------------------------------------------------------------------------
  it('passes the caller user ID to checkRateLimit', async () => {
    setupHappyPath();

    await POST(makePostRequest(VALID_BODY) as never);

    expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    const [, key] = mockCheckRateLimit.mock.calls[0];
    expect(key).toBe(`ai-icebreakers:${CALLER_ID}`);
  });

  // -------------------------------------------------------------------------
  // 20. JSON array embedded in prose is extracted correctly
  // -------------------------------------------------------------------------
  it('extracts a JSON array embedded in surrounding prose text', async () => {
    const embeddedText = `Sure! Here are five ideas:\n${MOCK_AI_JSON}\nHave fun meeting your new crew!`;
    setupHappyPath(embeddedText);

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.icebreakers).toHaveLength(5);
    expect(body.icebreakers[0]).toBe(MOCK_ICEBREAKERS[0]);
  });

  // -------------------------------------------------------------------------
  // 21. Returns empty icebreakers when AI array contains mixed types (some non-string)
  // The every() guard requires ALL items to be strings — a mixed array fails.
  // -------------------------------------------------------------------------
  it('returns empty icebreakers when AI array contains mixed string and non-string items', async () => {
    // Mixed: first item is a string, rest are numbers — every() returns false
    const mixedArray = JSON.stringify(['hello', 2, 3, 4, 5]);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: mixedArray } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.icebreakers).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 22. Response shape always contains icebreakers key
  // -------------------------------------------------------------------------
  it('response always contains the icebreakers key at the top level', async () => {
    setupHappyPath();

    const res = await POST(makePostRequest(VALID_BODY) as never);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body)).toContain('icebreakers');
  });

  // -------------------------------------------------------------------------
  // 23. 500 response calls captureException and logError
  // -------------------------------------------------------------------------
  it('calls captureException and logError on unhandled error', async () => {
    const { captureException } = await import('@/lib/sentry');
    const { logError } = await import('@/lib/logger');

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockCrewFindFirst.mockResolvedValueOnce(MOCK_CREW_RECORD as never);
    mockUserFindUnique.mockResolvedValueOnce(MOCK_CREW_MEMBER_USER as never);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('Upstream failure'));

    const res = await POST(makePostRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith('AI_ICEBREAKERS', expect.any(Error));
  });
});
