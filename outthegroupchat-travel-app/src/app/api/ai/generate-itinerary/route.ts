import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getModel } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { itinerarySystemPrompt, buildItineraryPrompt } from '@/lib/ai/prompts';
import type { AIGeneratedItinerary, TripPreferences } from '@/types';

// Route segment config for AI itinerary generation
export const maxDuration = 60; // seconds - AI generation can take longer
export const dynamic = 'force-dynamic';

const generateItinerarySchema = z.object({
  tripId: z.string(),
  customInstructions: z.string().optional(),
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
      itinerary = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[ITINERARY_PARSE_ERROR]', parseError);
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
    console.error('[AI_GENERATE_ITINERARY]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate itinerary' },
      { status: 500 }
    );
  }
}

