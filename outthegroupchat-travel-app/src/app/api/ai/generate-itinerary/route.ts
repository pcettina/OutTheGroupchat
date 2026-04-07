/**
 * @module api/ai/generate-itinerary
 *
 * AI-powered itinerary generation endpoint.
 *
 * Exposes a single operation:
 *   POST /api/ai/generate-itinerary
 *
 * Given an existing trip ID the route:
 *   1. Validates the authenticated user is a trip member.
 *   2. Collects member preferences and approved activities from the database.
 *   3. Constructs a structured prompt via `buildItineraryPrompt` and sends it
 *      to the configured OpenAI model (via Vercel AI SDK `generateText`).
 *   4. Parses and schema-validates the JSON returned by the model.
 *   5. Persists the generated itinerary days and items to the database inside a
 *      Prisma transaction (replacing any previously generated itinerary).
 *   6. Returns the full itinerary together with packing tips, local tips, and a
 *      budget breakdown.
 *
 * Route segment config:
 *   - `maxDuration`: 60 seconds — AI generation is slower than typical API calls.
 *   - `dynamic`: 'force-dynamic' — prevents static caching of responses.
 *
 * Authentication: Required (NextAuth session).
 * Rate limiting:  Redis-based via `aiRateLimiter` (Upstash).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getModel, isOpenAIConfigured } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { itinerarySystemPrompt, buildItineraryPrompt } from '@/lib/ai/prompts';
import { logError } from '@/lib/logger';
import type { AIGeneratedItinerary, TripPreferences } from '@/types';

// Route segment config for AI itinerary generation
export const maxDuration = 60; // seconds - AI generation can take longer
export const dynamic = 'force-dynamic';

const generateItinerarySchema = z.object({
  tripId: z.string(),
  customInstructions: z.string().optional(),
});

const itineraryItemSchema = z.object({
  time: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  duration: z.number(),
  cost: z.object({
    amount: z.number(),
    per: z.enum(['person', 'group']),
  }),
  category: z.enum(['food', 'activity', 'transport', 'leisure']).default('activity'),
  optional: z.boolean().optional().default(false),
  notes: z.string().optional(),
}).passthrough();

const mealSchema = z.object({
  name: z.string(),
  cuisine: z.string(),
  priceRange: z.string(),
});

const itineraryDaySchema = z.object({
  dayNumber: z.number(),
  date: z.string(),
  theme: z.string(),
  items: z.array(itineraryItemSchema),
  meals: z.object({
    breakfast: mealSchema.optional(),
    lunch: mealSchema.optional(),
    dinner: mealSchema.optional(),
  }).default({}),
  weatherBackup: z.string().optional(),
});

const aiGeneratedItinerarySchema = z.object({
  overview: z.string().optional().default(''),
  days: z.array(itineraryDaySchema),
  budgetBreakdown: z.object({
    accommodation: z.number(),
    food: z.number(),
    activities: z.number(),
    transport: z.number(),
    total: z.number().default(0),
  }),
  packingTips: z.array(z.string()),
  localTips: z.array(z.string()),
});

/**
 * POST /api/ai/generate-itinerary
 *
 * Generates a full day-by-day itinerary for a trip using the configured AI model,
 * then persists it to the database.
 *
 * Authentication: Required (NextAuth session). Returns 401 if unauthenticated.
 * Rate limiting:  Redis-based `aiRateLimiter`. Returns 429 with Retry-After headers
 *                 when the limit is exceeded.
 * AI availability: Returns 503 when `OPENAI_API_KEY` is not configured.
 *
 * Request body (JSON):
 * ```json
 * {
 *   "tripId":             "<cuid>",            // required — the trip to generate for
 *   "customInstructions": "Focus on museums"   // optional — appended to the base prompt
 * }
 * ```
 *
 * Response 200:
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "itinerary": {
 *       "overview":        "...",
 *       "days":            [ /* ItineraryDay objects *\/ ],
 *       "budgetBreakdown": { "accommodation": 0, "food": 0, "activities": 0, "transport": 0, "total": 0 },
 *       "packingTips":     ["..."],
 *       "localTips":       ["..."]
 *     },
 *     "savedDays": 3,
 *     "tips": {
 *       "packing": ["..."],
 *       "local":   ["..."]
 *     },
 *     "budget": { "accommodation": 0, "food": 0, "activities": 0, "transport": 0, "total": 0 }
 *   }
 * }
 * ```
 *
 * Error responses:
 * - 400 Invalid JSON body or Zod validation failure (`{ success: false, error, details? }`)
 * - 401 Unauthenticated
 * - 403 Authenticated user is not a member of the requested trip
 * - 404 Trip not found
 * - 429 Rate limit exceeded (includes `Retry-After` and `X-RateLimit-*` headers)
 * - 500 AI response parse failure or unexpected server error
 * - 502 AI returned a response that did not conform to the expected itinerary schema
 * - 503 OpenAI API key not configured
 *
 * @param req - Incoming HTTP request containing the JSON body described above.
 * @returns NextResponse with the generated itinerary data or an error payload.
 * @throws Does not throw — all errors are caught and returned as JSON responses.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fail fast if the AI service is not configured
    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        { error: 'AI service is not available. OPENAI_API_KEY is not configured.' },
        { status: 503 }
      );
    }

    // Redis-based rate limiting for serverless environments
    const rateLimitResult = await checkRateLimit(aiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before generating another itinerary.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    const validationResult = generateItinerarySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tripId, customInstructions } = validationResult.data;

    // Fetch trip details with survey data
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, preferences: true },
            },
          },
        },
        survey: {
          include: {
            responses: {
              include: {
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
        activities: {
          where: { status: 'APPROVED' },
        },
      },
    });

    if (!trip) {
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Check if user is a member
    const isMember = trip.members.some(m => m.userId === session.user.id);
    if (!isMember) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to generate itinerary for this trip' },
        { status: 403 }
      );
    }

    // Extract destination info
    const destination = trip.destination as { city: string; country: string };
    const destinationStr = `${destination.city}, ${destination.country}`;

    // Collect member preferences
    const preferences: TripPreferences[] = trip.members.map(m => {
      const userPrefs = m.user.preferences as Record<string, unknown> || {};
      return {
        travelStyle: userPrefs.travelStyle as TripPreferences['travelStyle'],
        interests: userPrefs.interests as string[],
        budgetRange: userPrefs.budgetRange as TripPreferences['budgetRange'],
      };
    });

    // Build prompt
    const prompt = buildItineraryPrompt({
      destination: destinationStr,
      dates: {
        start: trip.startDate.toISOString().split('T')[0],
        end: trip.endDate.toISOString().split('T')[0],
      },
      groupSize: trip.members.length,
      preferences,
      budget: trip.budget as { total: number; currency: string } | undefined,
    });

    const fullPrompt = customInstructions 
      ? `${prompt}\n\nAdditional instructions from the user:\n${customInstructions}`
      : prompt;

    // Generate itinerary using AI
    const model = getModel('itinerary');
    const { text } = await generateText({
      model,
      system: itinerarySystemPrompt,
      prompt: fullPrompt,
    });

    // Parse the response
    let itinerary: AIGeneratedItinerary;
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const itineraryResult = aiGeneratedItinerarySchema.safeParse(parsed);
      if (!itineraryResult.success) {
        logError('ITINERARY_PARSE_ERROR', new Error('AI response did not match expected schema'), {
          issues: itineraryResult.error.flatten(),
        });
        return NextResponse.json(
          { success: false, error: 'Invalid AI response format' },
          { status: 502 }
        );
      }
      itinerary = itineraryResult.data;
    } catch (parseError) {
      logError('ITINERARY_PARSE_ERROR', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse AI response', rawResponse: text },
        { status: 500 }
      );
    }

    // Optionally save to database
    // Create itinerary days from AI response
    const savedItinerary = await prisma.$transaction(async (tx) => {
      // Delete existing itinerary
      await tx.itineraryItem.deleteMany({
        where: { itineraryDay: { tripId } },
      });
      await tx.itineraryDay.deleteMany({
        where: { tripId },
      });

      // Create new itinerary days
      const createdDays = [];
      for (const day of itinerary.days) {
        const itineraryDay = await tx.itineraryDay.create({
          data: {
            tripId,
            dayNumber: day.dayNumber,
            date: new Date(day.date),
            notes: day.theme,
          },
        });

        // Create items for this day
        if (day.items.length > 0) {
          await tx.itineraryItem.createMany({
            data: day.items.map((item, index) => ({
              itineraryDayId: itineraryDay.id,
              order: index,
              startTime: item.time,
              customTitle: item.title,
              notes: `${item.description}\n\nLocation: ${item.location}\nDuration: ${item.duration} mins\nCost: $${item.cost.amount} per ${item.cost.per}${item.notes ? `\n\n${item.notes}` : ''}`,
            })),
          });
        }

        createdDays.push(itineraryDay);
      }

      return createdDays;
    });

    return NextResponse.json({
      success: true,
      data: {
        itinerary,
        savedDays: savedItinerary.length,
        tips: {
          packing: itinerary.packingTips,
          local: itinerary.localTips,
        },
        budget: itinerary.budgetBreakdown,
      },
    });
  } catch (error) {
    logError('AI_GENERATE_ITINERARY', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate itinerary' },
      { status: 500 }
    );
  }
}

