import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getModel } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { activityRecommendationSystemPrompt, buildActivityPrompt } from '@/lib/ai/prompts';
import type { AIActivityRecommendation } from '@/types';

// Route segment config for AI suggestions
export const maxDuration = 60; // seconds - AI generation can take longer
export const dynamic = 'force-dynamic';

const suggestActivitiesSchema = z.object({
  destination: z.string(),
  categories: z.array(z.string()).optional().default(['food', 'entertainment', 'culture']),
  preferences: z.array(z.string()).optional().default([]),
  budget: z.enum(['budget', 'moderate', 'luxury']).optional().default('moderate'),
  groupSize: z.number().optional().default(4),
  tripDates: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
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
        { success: false, error: 'Rate limit exceeded. Please wait before requesting more suggestions.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();
    const validationResult = suggestActivitiesSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { destination, categories, preferences, budget, groupSize, tripDates } = validationResult.data;

    // Build prompt
    const prompt = buildActivityPrompt({
      destination,
      categories,
      preferences,
      budget,
      groupSize,
      tripDates,
    });

    // Generate recommendations using AI
    const model = getModel('suggestions');
    const { text } = await generateText({
      model,
      system: activityRecommendationSystemPrompt,
      prompt,
    });

    // Parse the response
    let recommendations: { 
      recommendations: AIActivityRecommendation[];
      localEvents?: { name: string; date: string; description: string; relevance: string }[];
    };
    
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      recommendations = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[ACTIVITY_SUGGESTIONS_PARSE_ERROR]', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse AI response', rawResponse: text },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        activities: recommendations.recommendations,
        events: recommendations.localEvents || [],
        meta: {
          destination,
          categories,
          budget,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[AI_SUGGEST_ACTIVITIES]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate activity suggestions' },
      { status: 500 }
    );
  }
}

