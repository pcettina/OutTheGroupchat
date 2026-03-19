/**
 * Unit tests for the AI API route handlers.
 *
 * Routes:
 *  - POST /api/ai/suggest-activities
 *  - POST /api/ai/generate-itinerary
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, AI SDK, rate-limit)
 *   are mocked.  No real AI calls or DB connections are made.
 * - Handlers are invoked directly with a minimal Request object.
 * - The ai.test.ts file extends setup.ts mocks with additional Prisma models
 *   and stubs for the AI SDK, rate-limiter, and AI client utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK)
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/client
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/client', () => ({
  getModel: vi.fn().mockReturnValue('mock-model'),
  isOpenAIConfigured: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/prompts
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/prompts', () => ({
  itinerarySystemPrompt: 'system prompt',
  buildItineraryPrompt: vi.fn().mockReturnValue('itinerary prompt'),
  activityRecommendationSystemPrompt: 'activity system prompt',
  buildActivityPrompt: vi.fn().mockReturnValue('activity prompt'),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit
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
      itineraryDay: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      itineraryItem: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai/suggest-activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeItineraryRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai/generate-itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockSession = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
};

// ---------------------------------------------------------------------------
// POST /api/ai/suggest-activities
// ---------------------------------------------------------------------------
describe('POST /api/ai/suggest-activities', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/ai/suggest-activities/route');
    POST = mod.POST;
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ destination: 'Paris' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when destination is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when budget is invalid enum value', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ destination: 'Paris', budget: 'expensive' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: 60 });

    const res = await POST(makeRequest({ destination: 'Paris' }));
    expect(res.status).toBe(429);
  });

  it('returns 200 with activity suggestions on success', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        recommendations: [
          {
            name: 'Eiffel Tower',
            description: 'Iconic landmark',
            category: 'culture',
            estimatedDuration: 120,
            estimatedCost: { amount: 25, currency: 'USD', per: 'person' },
            location: { address: 'Champ de Mars, Paris' },
            rating: 4.8,
            tags: ['iconic', 'culture'],
          },
        ],
        localEvents: [],
      }),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeRequest({ destination: 'Paris', budget: 'moderate' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.activities).toHaveLength(1);
    expect(json.data.activities[0].name).toBe('Eiffel Tower');
    expect(json.data.meta.destination).toBe('Paris');
  });

  it('returns 200 with empty events array when localEvents is absent', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ recommendations: [] }),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeRequest({ destination: 'Tokyo' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.events).toEqual([]);
  });

  it('returns 500 when AI response is not valid JSON', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: 'Not a JSON response at all',
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeRequest({ destination: 'Paris' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/parse/i);
  });

  it('returns 500 on unexpected internal error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new Error('OpenAI unavailable'));

    const res = await POST(makeRequest({ destination: 'Paris' }));
    expect(res.status).toBe(500);
  });

  it('accepts optional categories and groupSize', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ recommendations: [] }),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeRequest({
      destination: 'Rome',
      categories: ['food', 'culture'],
      groupSize: 6,
      budget: 'budget',
    }));
    expect(res.status).toBe(200);
  });

  it('includes meta with destination and categories in response', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ recommendations: [] }),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeRequest({ destination: 'Lisbon', categories: ['food'] }));
    const json = await res.json();
    expect(json.data.meta.destination).toBe('Lisbon');
    expect(json.data.meta.categories).toEqual(['food']);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/generate-itinerary
// ---------------------------------------------------------------------------
describe('POST /api/ai/generate-itinerary', () => {
  let POST: (req: Request) => Promise<Response>;

  const mockTrip = {
    id: 'trip-1',
    title: 'Paris Trip',
    description: null,
    status: 'PLANNING' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    destination: { city: 'Paris', country: 'France' },
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-07'),
    budget: { total: 3000, currency: 'USD' },
    coverImage: null,
    isPublic: false,
    viewCount: 0,
    ownerId: 'user-1',
    members: [
      {
        userId: 'user-1',
        user: { id: 'user-1', name: 'Test User', preferences: { travelStyle: 'adventure' } },
      },
    ],
    survey: null,
    activities: [],
  };

  const mockItinerary = {
    days: [
      {
        dayNumber: 1,
        date: '2026-06-01',
        theme: 'Arrival day',
        items: [
          {
            time: '14:00',
            title: 'Hotel check-in',
            description: 'Check into hotel',
            location: 'Hotel Paris',
            duration: 30,
            cost: { amount: 0, per: 'person' },
            notes: '',
          },
        ],
      },
    ],
    packingTips: ['Light layers'],
    localTips: ['Use the Metro'],
    budgetBreakdown: { accommodation: 1000, food: 500, activities: 300, transport: 200 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/ai/generate-itinerary/route');
    POST = mod.POST;
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when tripId is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeItineraryRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: 60 });

    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(429);
  });

  it('returns 404 when trip is not found', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(null);

    const res = await POST(makeItineraryRequest({ tripId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a trip member', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue({
      ...mockTrip,
      members: [{ userId: 'other-user', user: { id: 'other-user', name: 'Other', preferences: null } }],
    } as Parameters<typeof prisma.trip.findUnique>[0] extends infer T ? NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>> : never);

    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with generated itinerary on success', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockTrip as Parameters<typeof prisma.trip.findUnique>[0] extends infer T ? NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>> : never);

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify(mockItinerary),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const mockTx = {
        itineraryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
        itineraryDay: { deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'day-1' }) },
      };
      return (fn as unknown as (tx: typeof mockTx) => Promise<unknown>)(mockTx);
    });

    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.itinerary).toBeDefined();
    expect(json.data.itinerary.days).toHaveLength(1);
  });

  it('returns 500 when AI response has no JSON', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockTrip as Parameters<typeof prisma.trip.findUnique>[0] extends infer T ? NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>> : never);

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: 'Here is your itinerary but with no JSON!',
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/parse/i);
  });

  it('accepts optional customInstructions', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockTrip as Parameters<typeof prisma.trip.findUnique>[0] extends infer T ? NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>> : never);

    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify(mockItinerary),
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const mockTx = {
        itineraryItem: { deleteMany: vi.fn(), createMany: vi.fn() },
        itineraryDay: { deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'day-1' }) },
      };
      return (fn as unknown as (tx: typeof mockTx) => Promise<unknown>)(mockTx);
    });

    const res = await POST(makeItineraryRequest({
      tripId: 'trip-1',
      customInstructions: 'Focus on vegan-friendly restaurants',
    }));
    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected internal error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findUnique).mockRejectedValue(new Error('DB failure'));

    const res = await POST(makeItineraryRequest({ tripId: 'trip-1' }));
    expect(res.status).toBe(500);
  });
});
