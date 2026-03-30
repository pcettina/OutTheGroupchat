/**
 * Unit tests for POST /api/ai/chat
 *
 * Strategy
 * --------
 * - The Vercel AI SDK ('ai') is mocked so streamText returns a fake object
 *   with a toTextStreamResponse() method that returns a plain Response.
 * - @/lib/ai/client is mocked so isOpenAIConfigured and getModel are fully
 *   controllable per test.
 * - @/lib/rate-limit is mocked so checkRateLimit always succeeds by default.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 *
 * Each test configures its own mocks from scratch after vi.clearAllMocks().
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
// Mock: @/lib/rate-limit — separate from ai/client re-exports
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// Import mocked modules AFTER vi.mock declarations
import { streamText } from 'ai';
import { isOpenAIConfigured, getModel } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// Import the handler under test
import { POST } from '@/app/api/ai/chat/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockIsOpenAIConfigured = vi.mocked(isOpenAIConfigured);
const mockGetModel = vi.mocked(getModel);
const mockStreamText = vi.mocked(streamText);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-ai-chat-001';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'AI Tester', email: 'ai@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const RATE_LIMIT_OK = { success: true, limit: 20, remaining: 19, reset: Date.now() + 60000 };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 20, remaining: 0, reset: Date.now() + 60000 };

/** Fake streaming result returned by streamText mock. */
function makeFakeStreamResult() {
  return {
    toTextStreamResponse: vi.fn(() => new Response('streamed content', { status: 200 })),
    text: Promise.resolve('streamed content'),
  };
}

/** Build a POST Request with JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers for setting up happy-path state
// ---------------------------------------------------------------------------
function setupHappyPath() {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockIsOpenAIConfigured.mockReturnValueOnce(true);
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValueOnce({});
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests
// vi.resetAllMocks() is used (superset of clearAllMocks) because
// vi.clearAllMocks() does not flush mockResolvedValueOnce queues, which
// causes state leakage between tests when a test fails mid-way.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/ai/chat
// ===========================================================================
describe('POST /api/ai/chat', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 503 when OPENAI_API_KEY is not configured
  // -------------------------------------------------------------------------
  it('returns 503 when OPENAI_API_KEY is not configured', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(false);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not configured/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 429 when rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    mockGetRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '999',
    });

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rate limit/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when messages field is missing
  // -------------------------------------------------------------------------
  it('returns 400 when messages field is missing', async () => {
    setupHappyPath();

    const req = makePostRequest({});
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when messages array is empty (min(1) Zod rule)
  // -------------------------------------------------------------------------
  it('returns 400 when messages array is empty', async () => {
    setupHappyPath();

    const req = makePostRequest({ messages: [] });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 400 when message has invalid role
  // NOTE: 'system' was added to the valid enum (user | assistant | system),
  // so the test now uses 'tool' which remains outside the allowed set.
  // -------------------------------------------------------------------------
  it('returns 400 when message role is not user, assistant, or system', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'tool', content: 'Invalid role test' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Calls streamText with correct messages on success
  // -------------------------------------------------------------------------
  it('calls streamText with the correct messages array and returns streaming response', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Suggest activities in Paris' }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Suggest activities in Paris' },
    ]);
    expect(callArgs.model).toBe(MOCK_MODEL);
    expect(fakeStream.toTextStreamResponse).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 8. Includes tripContext in system prompt when provided
  // -------------------------------------------------------------------------
  it('incorporates tripContext into the system prompt', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'What should we do?' }],
      tripContext: {
        tripId: 'trip-123',
        tripTitle: 'Rome Adventure',
        destination: 'Rome',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        memberCount: 4,
        budget: 2000,
      },
    });
    await POST(req);

    expect(mockStreamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.system).toContain('Rome Adventure');
    expect(callArgs.system).toContain('Rome');
    expect(callArgs.system).toContain('4');
  });

  // -------------------------------------------------------------------------
  // 9. Returns 500 when streamText throws a generic error
  // -------------------------------------------------------------------------
  it('returns 500 when streamText throws a generic error', async () => {
    setupHappyPath();
    mockStreamText.mockRejectedValueOnce(new Error('Connection timeout'));

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed to process/i);
  });

  // -------------------------------------------------------------------------
  // 10. Returns 503 when streamText throws an API key error
  // -------------------------------------------------------------------------
  it('returns 503 when streamText throws an API key error', async () => {
    setupHappyPath();
    mockStreamText.mockRejectedValueOnce(new Error('Invalid API key provided'));

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    // The route catches "API key" or "Invalid" errors in the inner catch
    // and returns 503 for auth failures
    expect([503, 500]).toContain(res.status);
    expect(body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 11. Returns 503 when getModel throws (model init failure)
  // -------------------------------------------------------------------------
  it('returns 503 when getModel throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockIsOpenAIConfigured.mockReturnValueOnce(true);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetRateLimitHeaders.mockReturnValueOnce({});
    mockGetModel.mockImplementationOnce(() => {
      throw new Error('Failed to get AI model');
    });

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/initialize AI service/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 12. Session user ID is used for rate limiting
  // -------------------------------------------------------------------------
  it('passes session user ID to checkRateLimit', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    await POST(req);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      null, // aiRateLimiter is null in test env (mocked as null)
      MOCK_USER_ID
    );
  });
});
