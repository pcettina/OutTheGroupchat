/**
 * Unit tests for GET handlers of the AI API routes.
 *
 * Routes covered:
 *  - GET /api/ai/chat          (quick destination tips)
 *  - GET /api/ai/recommend     (trip-specific recommendations)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, AI SDK, AI client)
 *   are mocked.  No real AI calls or DB connections are made.
 * - Handlers are invoked directly with a NextRequest object.
 * - vi.resetAllMocks() is called in beforeEach for full mock isolation.
 * - Default mock return values are re-established after each reset.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as aiClient from '@/lib/ai/client';
import * as chatRoute from '@/app/api/ai/chat/route';
import * as recommendRoute from '@/app/api/ai/recommend/route';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK)
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client
// chat/route.ts uses getModel + isOpenAIConfigured from @/lib/ai/client
// recommend/route.ts uses getModel + checkRateLimit from @/lib/ai/client
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  getModel: vi.fn().mockReturnValue('mock-model'),
  isOpenAIConfigured: vi.fn().mockReturnValue(true),
  checkRateLimit: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit (used only by chat POST, kept for completeness)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend global setup with additional models
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
      activity: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const mockSession = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
};

const mockTrip = {
  id: 'trip-1',
  title: 'Paris Trip',
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-07'),
  members: [
    {
      userId: 'user-1',
      user: {
        id: 'user-1',
        preferences: { interests: ['food', 'culture'] },
      },
    },
    {
      userId: 'user-2',
      user: {
        id: 'user-2',
        preferences: { interests: ['culture', 'nature'] },
      },
    },
  ],
  activities: [
    { category: 'FOOD' },
  ],
  survey: null,
};

const mockRecommendations = [
  {
    name: 'Louvre Museum',
    description: 'World-class art museum',
    category: 'CULTURE',
    estimatedCost: 17,
    duration: '3-4 hours',
    matchScore: 95,
    matchReasons: ['Popular with culture lovers'],
  },
];

// ---------------------------------------------------------------------------
// Helper: build NextRequest for GET handlers
// ---------------------------------------------------------------------------
function makeChatGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/ai/chat');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makeRecommendGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/ai/recommend');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// GET /api/ai/chat
// ---------------------------------------------------------------------------
describe('GET /api/ai/chat', () => {
  const GET = chatRoute.GET;

  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish permanent defaults after reset
    vi.mocked(aiClient.isOpenAIConfigured).mockReturnValue(true);
    vi.mocked(aiClient.getModel).mockReturnValue('mock-model' as unknown as ReturnType<typeof aiClient.getModel>);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeChatGetRequest({ destination: 'Paris' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 503 when OpenAI is not configured', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(aiClient.isOpenAIConfigured).mockReturnValue(false);

    const res = await GET(makeChatGetRequest({ destination: 'Paris' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 400 when destination query param is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const res = await GET(makeChatGetRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Destination is required');
  });

  it('returns 200 with tips array when AI returns a JSON array', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const tips = ['Visit the Eiffel Tower', 'Try a croissant', 'Take the Metro', 'Visit the Louvre', 'Book restaurants in advance'];
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockResolvedValueOnce({
      text: Promise.resolve(JSON.stringify(tips)),
    } as unknown as Awaited<ReturnType<typeof streamText>>);

    const res = await GET(makeChatGetRequest({ destination: 'Paris' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.destination).toBe('Paris');
    expect(Array.isArray(json.data.tips)).toBe(true);
    expect(json.data.tips).toHaveLength(5);
    expect(json.data.tips[0]).toBe('Visit the Eiffel Tower');
  });

  it('returns 200 with raw text wrapped in array when AI does not return JSON array', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const rawText = 'Here are some tips for visiting Tokyo.';
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockResolvedValueOnce({
      text: Promise.resolve(rawText),
    } as unknown as Awaited<ReturnType<typeof streamText>>);

    const res = await GET(makeChatGetRequest({ destination: 'Tokyo' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.destination).toBe('Tokyo');
    expect(Array.isArray(json.data.tips)).toBe(true);
    expect(json.data.tips[0]).toBe(rawText);
  });

  it('returns 200 with text fallback when AI returns non-array JSON', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    // JSON object (not array) — no array match, so falls back to [textContent]
    const rawText = '{ "message": "here are tips" }';
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockResolvedValueOnce({
      text: Promise.resolve(rawText),
    } as unknown as Awaited<ReturnType<typeof streamText>>);

    const res = await GET(makeChatGetRequest({ destination: 'Rome' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.tips).toEqual([rawText]);
  });

  it('returns 500 when streamText throws an unexpected error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const { streamText } = await import('ai');
    vi.mocked(streamText).mockRejectedValueOnce(new Error('Network failure'));

    const res = await GET(makeChatGetRequest({ destination: 'Paris' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to get tips');
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/recommend
// ---------------------------------------------------------------------------
describe('GET /api/ai/recommend', () => {
  const GET = recommendRoute.GET;

  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish permanent defaults after reset
    vi.mocked(aiClient.getModel).mockReturnValue('mock-model' as unknown as ReturnType<typeof aiClient.getModel>);
    vi.mocked(aiClient.checkRateLimit).mockReturnValue(true);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when tripId query param is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const res = await GET(makeRecommendGetRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 404 when trip is not found', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(null);

    const res = await GET(makeRecommendGetRequest({ tripId: 'nonexistent' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Trip not found');
  });

  it('returns 200 with recommendations on success', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(mockRecommendations),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.tripId).toBe('trip-1');
    expect(json.data.destination).toBe('Paris');
    expect(Array.isArray(json.data.recommendations)).toBe(true);
    expect(json.data.recommendations).toHaveLength(1);
    expect(json.data.recommendations[0].name).toBe('Louvre Museum');
  });

  it('returns groupInterests derived from member preferences', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(mockRecommendations),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    // 'culture' appears in both members' prefs so it ranks at the top
    expect(Array.isArray(json.data.groupInterests)).toBe(true);
    expect(json.data.groupInterests[0]).toBe('culture');
  });

  it('returns empty recommendations when AI response is not a valid JSON array', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Here are some great activities for Paris!',
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toEqual([]);
  });

  it('returns empty recommendations when AI returns array items that fail Zod schema', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const { generateText } = await import('ai');
    // Array items missing required fields — fails aiRecommendationsOutputSchema
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify([{ name: 'Broken item' }]),
    } as Awaited<ReturnType<typeof generateText>>);

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toEqual([]);
  });

  it('returns 500 when prisma throws an unexpected error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to get recommendations');
  });

  it('returns 500 when generateText throws an unexpected error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
      mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValueOnce(new Error('OpenAI rate limit'));

    const res = await GET(makeRecommendGetRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to get recommendations');
  });
});
