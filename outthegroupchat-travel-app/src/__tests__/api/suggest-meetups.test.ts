/**
 * Unit tests for POST /api/ai/suggest-meetups (Phase 6 — AI meetup suggestions).
 *
 * Prisma, NextAuth, logger, and sentry mocks are established in setup.ts.
 * This file mocks @/lib/rate-limit and ai to control responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports that pull them.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: null,
  apiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@/lib/ai/client', () => ({
  getModel: vi.fn().mockReturnValue('mock-model'),
  isOpenAIConfigured: vi.fn().mockReturnValue(true),
  isAnthropicConfigured: vi.fn().mockReturnValue(false),
  checkRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — never use dynamic await import in beforeEach.
import { POST } from '@/app/api/ai/suggest-meetups/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { generateText } from 'ai';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/ai/suggest-meetups';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makePostReq = (body: unknown) =>
  new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const fakeSuggestions = [
  {
    title: 'Rooftop Jazz Night',
    venue_type: 'bar',
    activity: 'live music',
    duration_minutes: 120,
    time_of_day: 'evening' as const,
    vibe: 'chill',
    description: 'Enjoy jazz on a rooftop bar with city views.',
  },
  {
    title: 'Morning Farmers Market Brunch',
    venue_type: 'outdoor market',
    activity: 'brunch',
    duration_minutes: 90,
    time_of_day: 'morning' as const,
    vibe: 'casual',
    description: 'Explore local produce and grab brunch together.',
  },
  {
    title: 'Escape Room Challenge',
    venue_type: 'entertainment venue',
    activity: 'puzzle solving',
    duration_minutes: 60,
    time_of_day: 'afternoon' as const,
    vibe: 'competitive',
    description: 'Work together to escape a themed room.',
  },
  {
    title: 'Late Night Taco Crawl',
    venue_type: 'street food',
    activity: 'food tour',
    duration_minutes: 90,
    time_of_day: 'late_night' as const,
    vibe: 'fun',
    description: 'Hit the best late-night taco spots in the city.',
  },
];

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: 0,
  });
});

// ===========================================================================
// POST /api/ai/suggest-meetups
// ===========================================================================
describe('POST /api/ai/suggest-meetups', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ city: 'New York' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const res = await POST(makePostReq({ city: 'New York' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 400 when city is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({ theme: 'jazz' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when city is too short (1 char)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({ city: 'A' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when crewSize is out of range (0)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({ city: 'Austin', crewSize: 0 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 200 with suggestions array when OpenAI returns valid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(fakeSuggestions),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(makePostReq({ city: 'New York', crewSize: 4 }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(4);

    const first = body.suggestions[0];
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('venue_type');
    expect(first).toHaveProperty('activity');
    expect(first).toHaveProperty('duration_minutes');
    expect(first).toHaveProperty('time_of_day');
    expect(first).toHaveProperty('vibe');
    expect(first).toHaveProperty('description');
  });

  it('returns 200 with optional theme included in request', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(fakeSuggestions),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(
      makePostReq({ city: 'Los Angeles', theme: 'outdoor adventure', crewSize: 6 })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toBeDefined();
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it('returns 200 with empty suggestions array when OpenAI returns invalid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockResolvedValueOnce({
      text: 'Sorry, I cannot suggest meetups right now.',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(makePostReq({ city: 'Chicago' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(0);
  });

  it('returns 500 when generateText throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI API error'));

    const res = await POST(makePostReq({ city: 'Seattle' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to generate meetup suggestions');
  });

  it('validates that time_of_day values match expected enum values', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(fakeSuggestions),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(makePostReq({ city: 'Miami', crewSize: 3 }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const validTimeOfDay = ['morning', 'afternoon', 'evening', 'late_night'];
    for (const suggestion of body.suggestions) {
      expect(validTimeOfDay).toContain(suggestion.time_of_day);
    }
  });

  it('uses default crewSize of 4 when not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(fakeSuggestions),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await POST(makePostReq({ city: 'Denver' }));

    expect(res.status).toBe(200);
    // generateText was called — confirm it was invoked (crewSize defaulted to 4)
    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArg = mockGenerateText.mock.calls[0]?.[0];
    expect(callArg?.prompt).toContain('4 friends');
  });
});
