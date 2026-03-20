import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getModel } from '@/lib/ai/client';
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
  category: z.enum(['food', 'activity', 'transport', 'leisure']).optional(),
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
  }).optional(),
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
    total: z.number().optional(),
  }),
  packingTips: z.array(z.string()),
  localTips: z.array(z.string()),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Redis-based rate limiting for serverless environments
    const rateLimitResult = await checkRateLimit(aiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before generating another itinerary.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();
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

