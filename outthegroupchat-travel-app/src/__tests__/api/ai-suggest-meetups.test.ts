/**
 * Unit tests for POST /api/ai/suggest-meetups
 *
 * Strategy
 * --------
 * - `ai` (Vercel AI SDK) is mocked so generateText returns a controllable payload.
 * - `@/lib/ai/client` is mocked to stub getModel.
 * - `@/lib/rate-limit` is mocked at the module level for rate-limit control.
 * - NextAuth, logger, and sentry mocks come from src/__tests__/setup.ts.
 * - Each test uses mockResolvedValueOnce only; vi.clearAllMocks() runs in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any static imports that transitively
// pull these modules.
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(() => true),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — after vi.mock() hoisting
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { POST } from '@/app/api/ai/suggest-meetups/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);
const mockGetModel = vi.mocked(getModel);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CALLER_ID = 'user-caller-suggest-001';

const SESSION = {
  user: { id: CALLER_ID, name: 'Alice', email: 'alice@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const MOCK_SUGGESTIONS = [
  {
    title: 'Coffee & Catch-up at Ritual',
    venue_type: 'cafe',
    activity: 'coffee tasting',
    duration_minutes: 90,
    time_of_day: 'morning' as const,
    vibe: 'chill and cozy',
    description: 'Start your day with artisan coffee and good vibes.',
  },
  {
    title: 'Sunset Hike at Twin Peaks',
    venue_type: 'outdoor',
    activity: 'hiking',
    duration_minutes: 120,
    time_of_day: 'afternoon' as const,
    vibe: 'adventurous',
    description: 'Breathtaking views of the city at golden hour.',
  },
  {
    title: 'Trivia Night at The Knockout',
    venue_type: 'bar',
    activity: 'trivia',
    duration_minutes: 150,
    time_of_day: 'evening' as const,
    vibe: 'competitive and fun',
    description: 'Battle it out over craft beers and brain teasers.',
  },
  {
    title: 'Late Night Ramen Run',
    venue_type: 'restaurant',
    activity: 'dining',
    duration_minutes: 60,
    time_of_day: 'late_night' as const,
    vibe: 'cozy and warm',
    description: 'End the night with steaming bowls of ramen.',
  },
];

const MOCK_AI_TEXT = JSON.stringify(MOCK_SUGGESTIONS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/ai/suggest-meetups';

function makePostReq(body: unknown): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// beforeEach — clear state so mockResolvedValueOnce queues don't bleed
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm rate limit mock after clearAllMocks() wipes it
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/ai/suggest-meetups', () => {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ city: 'San Francisco' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'Ghost' },
      expires: '2099-01-01',
    } as never);

    const res = await POST(makePostReq({ city: 'San Francisco' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  it('returns 400 when city is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when city is too short (1 character)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makePostReq({ city: 'X' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when crewSize exceeds max (20)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makePostReq({ city: 'Boston', crewSize: 99 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when crewSize is below min (1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makePostReq({ city: 'Boston', crewSize: 0 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when body is invalid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON in request body');
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const res = await POST(makePostReq({ city: 'New York' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('calls checkRateLimit with a key scoped to the session user id', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'Chicago' }));

    // aiRateLimiter is exported as null from the mock (matching the module-level mock)
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      null,
      `ai-suggest-meetups:${CALLER_ID}`
    );
  });

  // -------------------------------------------------------------------------
  // Success paths
  // -------------------------------------------------------------------------
  it('returns 200 with suggestions array on valid request', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'San Francisco' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(4);
  });

  it('returns suggestions with correct shape (all required fields present)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'San Francisco' }));
    const body = await res.json();

    const requiredFields = ['title', 'venue_type', 'activity', 'duration_minutes', 'time_of_day', 'vibe', 'description'];
    body.suggestions.forEach((s: Record<string, unknown>) => {
      requiredFields.forEach((field) => {
        expect(s).toHaveProperty(field);
      });
    });
  });

  it('response body has only the suggestions key', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Austin' }));
    const body = await res.json();

    expect(Object.keys(body)).toEqual(['suggestions']);
  });

  it('uses default crewSize of 4 when omitted', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'Portland' }));

    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('4 friends');
  });

  it('passes city correctly into the AI prompt', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'New Orleans' }));

    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('New Orleans');
  });

  it('passes crewSize correctly into the AI prompt', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'Denver', crewSize: 7 }));

    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('7 friends');
  });

  it('includes theme in the AI prompt when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'Nashville', theme: 'outdoor adventure' }));

    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('outdoor adventure');
  });

  it('does not include theme in the AI prompt when omitted', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'Seattle' }));

    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).not.toContain('theme:');
  });

  it('returns 200 with empty suggestions when AI returns no JSON array', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: 'Here are some great ideas for your group!' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Miami' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  it('returns 200 with empty suggestions when AI returns a non-array JSON object', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: '{"message": "here are your suggestions"}' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Phoenix' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  it('returns 200 with empty suggestions when AI returns an array with schema violations', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    // Missing required fields (no title, no venue_type, etc.)
    mockGenerateText.mockResolvedValueOnce(
      { text: '[{"name": "Brunch", "type": "cafe"}]' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Las Vegas' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(0);
  });

  it('returns 200 with suggestions when AI wraps JSON array in markdown code block', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    const wrappedText = '```json\n' + MOCK_AI_TEXT + '\n```';
    mockGenerateText.mockResolvedValueOnce(
      { text: wrappedText } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Atlanta' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('suggestions');
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  // AI SDK error handling
  // -------------------------------------------------------------------------
  it('returns 500 when generateText throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI service unavailable'));

    const res = await POST(makePostReq({ city: 'Houston' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to generate meetup suggestions');
  });

  it('calls captureException when generateText throws', async () => {
    const { captureException } = await import('@/lib/sentry');
    const mockCaptureException = vi.mocked(captureException);

    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    const aiError = new Error('Network timeout');
    mockGenerateText.mockRejectedValueOnce(aiError);

    await POST(makePostReq({ city: 'Dallas' }));

    expect(mockCaptureException).toHaveBeenCalledWith(aiError);
  });

  // -------------------------------------------------------------------------
  // Edge cases / crew size
  // -------------------------------------------------------------------------
  it('accepts crewSize of 1 (minimum valid)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Portland', crewSize: 1 }));

    expect(res.status).toBe(200);
    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('1 friends');
  });

  it('accepts crewSize of 20 (maximum valid)', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'Minneapolis', crewSize: 20 }));

    expect(res.status).toBe(200);
    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { prompt: string }).prompt).toContain('20 friends');
  });

  it('passes the model from getModel to generateText', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    await POST(makePostReq({ city: 'San Diego' }));

    expect(mockGetModel).toHaveBeenCalledWith('suggestions');
    const [callArgs] = mockGenerateText.mock.calls[0];
    expect((callArgs as { model: unknown }).model).toBe(MOCK_MODEL);
  });

  it('returns suggestions data matching fixture when AI text is well-formed', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ city: 'San Francisco' }));
    const body = await res.json();

    expect(body.suggestions).toEqual(MOCK_SUGGESTIONS);
  });
});
