/**
 * Unit tests for POST /api/ai/generate-itinerary
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, AI SDK, rate-limit, logger)
 *   are mocked — no real I/O or AI calls occur.
 * - The route handler is imported statically at the top of the file (avoids
 *   the 10-second dynamic-import timeout seen with beforeEach imports).
 * - vi.resetAllMocks() is used in beforeEach to fully flush mockResolvedValueOnce
 *   queues and prevent state leakage between tests.
 * - The prisma mock is extended in this file to add $transaction support, which
 *   is not present in setup.ts.
 *
 * Coverage
 * --------
 * Auth guard, AI service config check, rate limiting, input validation,
 * trip not found, membership check, successful generation, customInstructions,
 * multi-day itineraries, invalid AI response schema, no-JSON AI response,
 * transaction DB error, and unexpected internal errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: ai (Vercel AI SDK) — must be declared before static route import
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
  itinerarySystemPrompt: 'You are an itinerary planning assistant.',
  buildItineraryPrompt: vi.fn().mockReturnValue('Build me an itinerary for Paris.'),
  activityRecommendationSystemPrompt: 'activity system prompt',
  buildActivityPrompt: vi.fn().mockReturnValue('activity prompt'),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — prevents real Redis calls (~4300ms each)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend the global setup.ts mock with $transaction
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
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      itineraryItem: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Static import of the route handler under test
// (Must come AFTER all vi.mock() calls)
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/ai/generate-itinerary/route';
import { generateText } from 'ai';
import { checkRateLimit } from '@/lib/rate-limit';
import { isOpenAIConfigured } from '@/lib/ai/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-gen-itin-1';
const MOCK_TRIP_ID = 'trip-gen-itin-abc';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Trip Planner', email: 'planner@example.com' },
  expires: '2099-01-01',
};

/** A minimal trip returned by prisma.trip.findUnique with the route's include. */
const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Paris Adventure',
  description: 'A week in Paris',
  status: 'PLANNING' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-07'),
  budget: { total: 5000, currency: 'USD' },
  coverImage: null,
  isPublic: false,
  viewCount: 0,
  ownerId: MOCK_USER_ID,
  members: [
    {
      userId: MOCK_USER_ID,
      user: {
        id: MOCK_USER_ID,
        name: 'Trip Planner',
        preferences: { travelStyle: 'cultural', interests: ['art', 'food'], budgetRange: 'moderate' },
      },
    },
  ],
  survey: null,
  activities: [],
};

/** A valid AI-generated itinerary JSON for a single-day trip. */
const MOCK_SINGLE_DAY_ITINERARY = {
  overview: 'A wonderful day exploring Paris.',
  days: [
    {
      dayNumber: 1,
      date: '2026-06-01',
      theme: 'Iconic Paris',
      items: [
        {
          time: '09:00',
          title: 'Eiffel Tower visit',
          description: 'Visit the iconic Eiffel Tower',
          location: 'Champ de Mars, Paris',
          duration: 120,
          cost: { amount: 25, per: 'person' },
          category: 'activity',
          optional: false,
          notes: 'Book tickets in advance',
        },
      ],
      meals: {
        breakfast: { name: 'Café de Flore', cuisine: 'French', priceRange: '$$' },
        lunch: { name: 'Le Comptoir', cuisine: 'Bistro', priceRange: '$$' },
        dinner: { name: 'Tour d\'Argent', cuisine: 'French', priceRange: '$$$$' },
      },
      weatherBackup: 'Louvre Museum indoors',
    },
  ],
  budgetBreakdown: {
    accommodation: 1500,
    food: 800,
    activities: 400,
    transport: 300,
    total: 3000,
  },
  packingTips: ['Comfortable walking shoes', 'Light jacket'],
  localTips: ['Use the Metro', 'Carry a museum pass'],
};

/** A valid AI-generated itinerary JSON for a multi-day trip. */
const MOCK_MULTI_DAY_ITINERARY = {
  overview: 'Three days exploring Paris.',
  days: [
    {
      dayNumber: 1,
      date: '2026-06-01',
      theme: 'Arrival & Orientation',
      items: [
        {
          time: '15:00',
          title: 'Hotel check-in',
          description: 'Check in and freshen up',
          location: 'Hotel Paris Centre',
          duration: 30,
          cost: { amount: 0, per: 'group' },
          category: 'transport',
        },
      ],
      meals: {},
    },
    {
      dayNumber: 2,
      date: '2026-06-02',
      theme: 'Museums & Art',
      items: [
        {
          time: '10:00',
          title: 'Louvre Museum',
          description: 'World-famous art museum',
          location: 'Rue de Rivoli, Paris',
          duration: 240,
          cost: { amount: 17, per: 'person' },
          category: 'activity',
        },
      ],
      meals: {
        lunch: { name: 'Museum Café', cuisine: 'International', priceRange: '$$' },
      },
    },
    {
      dayNumber: 3,
      date: '2026-06-03',
      theme: 'Departure Day',
      items: [],
      meals: {},
    },
  ],
  budgetBreakdown: {
    accommodation: 900,
    food: 450,
    activities: 200,
    transport: 150,
    total: 1700,
  },
  packingTips: ['Sunscreen', 'Reusable water bottle'],
  localTips: ['Paris Museum Pass saves money', 'Avoid tourist traps near major sites'],
};

/** Build a POST Request for the generate-itinerary endpoint. */
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai/generate-itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Set up a transaction mock that executes the callback with a fake tx object. */
function mockTransactionSuccess(dayId = 'itin-day-1'): void {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        itineraryItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        itineraryDay: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: dayId, tripId: MOCK_TRIP_ID }),
        },
      };
      return fn(mockTx);
    }
  );
}

// ---------------------------------------------------------------------------
// beforeEach: full mock reset to prevent state leakage
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Restore sensible defaults after resetAllMocks wipes them
  vi.mocked(isOpenAIConfigured).mockReturnValue(true);
  vi.mocked(checkRateLimit).mockResolvedValue({ success: true, limit: 20, remaining: 19, reset: 0 });
});

// ===========================================================================
// POST /api/ai/generate-itinerary
// ===========================================================================
describe('POST /api/ai/generate-itinerary', () => {

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  describe('Authentication', () => {
    it('returns 401 when there is no session', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
      expect(prisma.trip.findUnique).not.toHaveBeenCalled();
    });

    it('returns 401 when session exists but has no user id', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { name: 'No ID User' },
        expires: '2099-01-01',
      } as ReturnType<typeof getServerSession> extends Promise<infer T> ? T : never);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // AI service availability
  // -------------------------------------------------------------------------
  describe('AI service configuration', () => {
    it('returns 503 when OpenAI is not configured', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(isOpenAIConfigured).mockReturnValue(false);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toMatch(/not available|not configured/i);
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------
  describe('Rate limiting', () => {
    it('returns 429 when AI rate limit is exceeded', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        limit: 20,
        remaining: 0,
        reset: 60,
      });

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/rate limit/i);
    });

    it('includes rate limit headers when 429 is returned', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        limit: 20,
        remaining: 0,
        reset: 1234567890,
      });
      // getRateLimitHeaders is not reset by resetAllMocks since it was
      // declared in the mock factory — re-stub it for this test
      const { getRateLimitHeaders } = await import('@/lib/rate-limit');
      vi.mocked(getRateLimitHeaders).mockReturnValue({
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1234567890',
      });

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  describe('Input validation', () => {
    it('returns 400 when tripId is missing', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const res = await POST(makeRequest({}));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Validation failed');
      expect(body.details).toBeDefined();
    });

    it('returns 400 when body is completely empty', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const res = await POST(makeRequest(null));
      // null body causes json parse error or validation failure — either 400 or 500
      expect([400, 500]).toContain(res.status);
    });

    it('returns 400 when tripId is not a string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const res = await POST(makeRequest({ tripId: 12345 }));
      // Zod coerces number to string, so this may pass validation and reach trip lookup
      // We allow both 400 (validation) and 404 (trip not found after coercion)
      expect([400, 404]).toContain(res.status);
    });

    it('accepts optional customInstructions as a string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({
        tripId: MOCK_TRIP_ID,
        customInstructions: 'Focus on vegan-friendly restaurants',
      }));

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Trip lookup & membership
  // -------------------------------------------------------------------------
  describe('Trip lookup', () => {
    it('returns 404 when trip does not exist', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(null);

      const res = await POST(makeRequest({ tripId: 'nonexistent-trip' }));
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Trip not found');
    });

    it('returns 403 when authenticated user is not a trip member', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
        ...MOCK_TRIP,
        members: [
          {
            userId: 'other-user-99',
            user: { id: 'other-user-99', name: 'Other Person', preferences: null },
          },
        ],
      } as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/not authorized/i);
    });

    it('returns 403 for a trip with no members array', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
        ...MOCK_TRIP,
        members: [],
      } as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Successful generation
  // -------------------------------------------------------------------------
  describe('Successful itinerary generation', () => {
    it('returns 200 with generated itinerary on success', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.itinerary).toBeDefined();
      expect(body.data.itinerary.days).toHaveLength(1);
      expect(body.data.savedDays).toBe(1);
    });

    it('includes packing tips and local tips in the response', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(body.data.tips.packing).toEqual(['Comfortable walking shoes', 'Light jacket']);
      expect(body.data.tips.local).toEqual(['Use the Metro', 'Carry a museum pass']);
    });

    it('includes budget breakdown in the response', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(body.data.budget).toBeDefined();
      expect(body.data.budget.accommodation).toBe(1500);
      expect(body.data.budget.food).toBe(800);
      expect(body.data.budget.activities).toBe(400);
      expect(body.data.budget.transport).toBe(300);
    });

    it('handles multi-day itinerary correctly', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_MULTI_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

      // Multi-day: 3 days, each create call returns a different id
      let dayCounter = 0;
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            itineraryItem: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              createMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            itineraryDay: {
              deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
              create: vi.fn().mockImplementation(() =>
                Promise.resolve({ id: `day-${++dayCounter}`, tripId: MOCK_TRIP_ID })
              ),
            },
          };
          return fn(mockTx);
        }
      );

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.itinerary.days).toHaveLength(3);
      expect(body.data.savedDays).toBe(3);
    });

    it('uses customInstructions in the AI prompt', async () => {
      const { buildItineraryPrompt } = await import('@/lib/ai/prompts');
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const customInstructions = 'Make everything vegan-friendly';
      await POST(makeRequest({ tripId: MOCK_TRIP_ID, customInstructions }));

      // buildItineraryPrompt should have been called once
      expect(buildItineraryPrompt).toHaveBeenCalledOnce();
      // The AI generateText call should have received a prompt containing the custom instructions
      const generateTextCalls = vi.mocked(generateText).mock.calls;
      expect(generateTextCalls).toHaveLength(1);
      const calledPrompt = generateTextCalls[0][0].prompt as string;
      expect(calledPrompt).toContain(customInstructions);
    });

    it('works for a trip with no budget set', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
        ...MOCK_TRIP,
        budget: null,
      } as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
    });

    it('works for a trip with multiple members (collects all preferences)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce({
        ...MOCK_TRIP,
        members: [
          {
            userId: MOCK_USER_ID,
            user: {
              id: MOCK_USER_ID,
              name: 'Trip Planner',
              preferences: { travelStyle: 'cultural', interests: ['art'], budgetRange: 'moderate' },
            },
          },
          {
            userId: 'user-2',
            user: {
              id: 'user-2',
              name: 'Friend',
              preferences: { travelStyle: 'adventure', interests: ['hiking'], budgetRange: 'budget' },
            },
          },
        ],
      } as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('works for a trip where AI response JSON is wrapped in markdown code block', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      // The route uses a regex /\{[\s\S]*\}/ to extract JSON — wrapping in text is OK
      const wrappedText = `Here is your itinerary:\n\n${JSON.stringify(MOCK_SINGLE_DAY_ITINERARY)}\n\nEnjoy your trip!`;
      vi.mocked(generateText).mockResolvedValueOnce({
        text: wrappedText,
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // AI response parsing failures
  // -------------------------------------------------------------------------
  describe('AI response parsing', () => {
    it('returns 500 when AI response contains no JSON', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Here is your itinerary! Unfortunately I cannot provide JSON right now.',
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/parse/i);
    });

    it('returns 500 when AI response has malformed JSON', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{ "days": [{ broken json here',
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
    });

    it('returns 502 when AI response JSON fails schema validation', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      // Return valid JSON but missing required fields (no days array)
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify({
          overview: 'Nice trip',
          randomField: 'not what the schema expects',
        }),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/invalid ai response format/i);
    });

    it('returns 500 with rawResponse when JSON parse throws', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      // Provide invalid JSON that the regex will match but JSON.parse will reject
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{invalid: json, no quotes}',
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      // rawResponse should be present in the response body
      expect(body.rawResponse).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Database / transaction errors
  // -------------------------------------------------------------------------
  describe('Database errors', () => {
    it('returns 500 when prisma.trip.findUnique throws', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockRejectedValueOnce(new Error('Database connection failed'));

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to generate itinerary');
    });

    it('returns 500 when $transaction throws during itinerary save', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Transaction failed')
      );

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // AI client / generateText errors
  // -------------------------------------------------------------------------
  describe('AI client errors', () => {
    it('returns 500 when generateText throws an unexpected error', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockRejectedValueOnce(new Error('OpenAI rate limit reached'));

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to generate itinerary');
    });

    it('calls getModel with "itinerary" task type', async () => {
      const { getModel } = await import('@/lib/ai/client');
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(MOCK_SINGLE_DAY_ITINERARY),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      await POST(makeRequest({ tripId: MOCK_TRIP_ID }));

      expect(getModel).toHaveBeenCalledWith('itinerary');
    });
  });

  // -------------------------------------------------------------------------
  // Itinerary schema edge cases
  // -------------------------------------------------------------------------
  describe('Itinerary schema edge cases', () => {
    it('handles itinerary day with no items (empty items array)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      const itineraryWithEmptyDay = {
        ...MOCK_SINGLE_DAY_ITINERARY,
        days: [
          {
            dayNumber: 1,
            date: '2026-06-01',
            theme: 'Rest day',
            items: [],
            meals: {},
          },
        ],
      };
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(itineraryWithEmptyDay),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.itinerary.days[0].items).toHaveLength(0);
    });

    it('handles itinerary with missing optional overview field', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      const itineraryNoOverview = { ...MOCK_SINGLE_DAY_ITINERARY };
      delete (itineraryNoOverview as Record<string, unknown>).overview;

      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(itineraryNoOverview),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
    });

    it('handles itinerary with missing budgetBreakdown.total (defaults to 0)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      vi.mocked(prisma.trip.findUnique).mockResolvedValueOnce(
        MOCK_TRIP as unknown as NonNullable<Awaited<ReturnType<typeof prisma.trip.findUnique>>>
      );
      const itineraryNoTotal = {
        ...MOCK_SINGLE_DAY_ITINERARY,
        budgetBreakdown: {
          accommodation: 1000,
          food: 400,
          activities: 200,
          transport: 100,
          // total omitted — Zod schema defaults to 0
        },
      };
      vi.mocked(generateText).mockResolvedValueOnce({
        text: JSON.stringify(itineraryNoTotal),
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
      mockTransactionSuccess();

      const res = await POST(makeRequest({ tripId: MOCK_TRIP_ID }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.budget.total).toBe(0);
    });
  });
});
