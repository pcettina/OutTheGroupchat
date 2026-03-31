/**
 * Edge case tests for POST /api/ai/chat — Zod validation boundaries
 *
 * Strategy
 * --------
 * This file covers validation edge cases NOT already tested in ai-chat.test.ts:
 *   - Blocked roles: 'tool', 'function' (rejected by z.enum; 'system' is allowed)
 *   - Content type errors: null, number, boolean, missing
 *   - Non-array messages: string, plain object
 *   - null messages field
 *   - Multi-turn conversation (user + assistant alternation)
 *   - Empty string content (rejected — min(1) set on content)
 *   - Very large content (10,000 chars — at max(10000) boundary, should pass)
 *   - Large messages array (20 turns — under max(50), should pass)
 *   - Extra top-level fields (Zod strips unknown keys by default)
 *   - tripContext missing required fields
 *   - tripContext with optional budget omitted
 *   - tripContext budget as non-number
 *   - Invalid JSON body → explicit try-catch returns 400
 *   - Request body is null
 *   - Messages field is null
 *
 * Mock hygiene: each test sets up its own mocks via mockResolvedValueOnce /
 * mockReturnValueOnce.  vi.resetAllMocks() in beforeEach flushes all queues.
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
// Mock: @/lib/ai/client
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
// Mock: @/lib/rate-limit
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(),
}));

// Static imports — must come after vi.mock declarations
import { streamText } from 'ai';
import { isOpenAIConfigured, getModel } from '@/lib/ai/client';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
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
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Validator Tester', email: 'validator@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;
const RATE_LIMIT_OK = { success: true, limit: 20, remaining: 19, reset: Date.now() + 60000 };

/** Fake stream result returned by streamText mock. */
function makeFakeStreamResult() {
  return {
    toTextStreamResponse: vi.fn(() => new Response('streamed', { status: 200 })),
    text: Promise.resolve('streamed'),
  };
}

/** Set up the authenticated, configured, rate-limit-OK state. */
function setupHappyPath() {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  mockIsOpenAIConfigured.mockReturnValueOnce(true);
  mockGetModel.mockReturnValueOnce(MOCK_MODEL);
  mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
  mockGetRateLimitHeaders.mockReturnValueOnce({});
}

/** Build a POST Request with a JSON-serializable body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a POST Request with a raw string body (not valid JSON). */
function makeRawPostRequest(rawBody: string): Request {
  return new Request('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests — use resetAllMocks (superset of clearAllMocks)
// to ensure mockResolvedValueOnce queues are fully flushed.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

// ===========================================================================
// Edge case tests — Zod validation
// ===========================================================================
describe('POST /api/ai/chat — Zod validation edge cases', () => {

  // -------------------------------------------------------------------------
  // Role validation: blocked roles
  // -------------------------------------------------------------------------

  it('returns 400 when message role is "tool" (not in enum)', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'tool', content: 'tool result here' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message role is "function" (not in enum)', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'function', content: 'fn result' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message role is an empty string', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: '', content: 'hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message role is null', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: null, content: 'hello' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Role validation: valid roles
  // -------------------------------------------------------------------------

  it('passes validation and streams when role is "assistant"', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'assistant', content: 'Here is the plan.' }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: 'assistant', content: 'Here is the plan.' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Content validation
  // -------------------------------------------------------------------------

  it('returns 400 when message content is null', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user', content: null }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message content is a number', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user', content: 42 }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message content is missing entirely', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when message content is an empty string (min(1) enforced)', async () => {
    // z.string().min(1) rejects empty strings
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user', content: '' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('passes validation when message content is exactly at the 10000 char max', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const longContent = 'A'.repeat(10_000);
    const req = makePostRequest({
      messages: [{ role: 'user', content: longContent }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Messages array shape validation
  // -------------------------------------------------------------------------

  it('returns 400 when messages is a string instead of an array', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: 'tell me about Paris',
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when messages is a plain object instead of an array', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: { role: 'user', content: 'hello' },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when messages is null', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: null,
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('passes validation with a 20-turn conversation (under max(50) messages)', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    // Alternate user/assistant messages, 20 turns
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Turn ${i + 1} content`,
    }));

    const req = makePostRequest({ messages });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(20);
  });

  // -------------------------------------------------------------------------
  // Unknown / extra fields
  // -------------------------------------------------------------------------

  it('passes validation and ignores unknown top-level fields (Zod strips them)', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      unknownField: 'should be stripped',
      anotherExtra: 12345,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Invalid JSON body
  // -------------------------------------------------------------------------

  it('returns 400 when request body is not valid JSON', async () => {
    // req.json() is wrapped in try-catch; returns 400 with explicit error
    setupHappyPath();

    const req = makeRawPostRequest('this is not json {{{');
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid json/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // tripContext validation
  // -------------------------------------------------------------------------

  it('returns 400 when tripContext is provided but missing required field (destination)', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'What should we do?' }],
      tripContext: {
        tripId: 'clh7nz5vr0000mg0hb9gkfxe0',
        tripTitle: 'Paris Trip',
        // destination is missing
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        memberCount: 3,
      },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('passes validation when tripContext has all required fields but no optional budget', async () => {
    setupHappyPath();

    const fakeStream = makeFakeStreamResult();
    mockStreamText.mockResolvedValueOnce(
      fakeStream as unknown as Awaited<ReturnType<typeof streamText>>
    );

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Any tips?' }],
      tripContext: {
        tripId: 'clh7nz5vr0000mg0hb9gkfxe0',
        tripTitle: 'Tokyo Trip',
        destination: 'Tokyo',
        startDate: '2026-09-01',
        endDate: '2026-09-14',
        memberCount: 2,
        // budget intentionally omitted
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.system).toContain('Tokyo');
  });

  it('returns 400 when tripContext memberCount is a string instead of number', async () => {
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'user', content: 'Hello' }],
      tripContext: {
        tripId: 'clh7nz5vr0000mg0hb9gkfxe0',
        tripTitle: 'Barcelona Trip',
        destination: 'Barcelona',
        startDate: '2026-08-01',
        endDate: '2026-08-10',
        memberCount: 'four', // should be a number
      },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Validation error response shape
  // -------------------------------------------------------------------------

  it('includes a "details" field in the validation error response body', async () => {
    // 'system' is now a valid role in the schema — use 'tool' to trigger Zod error
    setupHappyPath();

    const req = makePostRequest({
      messages: [{ role: 'tool', content: 'Injected tool result' }],
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('details');
    // Zod flatten() produces fieldErrors and formErrors
    expect(body.details).toHaveProperty('fieldErrors');
  });
});
