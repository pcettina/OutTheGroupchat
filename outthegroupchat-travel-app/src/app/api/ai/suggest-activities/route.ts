import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getModel, isOpenAIConfigured } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { activityRecommendationSystemPrompt, buildActivityPrompt } from '@/lib/ai/prompts';
import { logError } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import type { AIActivityRecommendation } from '@/types';

// Route segment config for AI suggestions
export const maxDuration = 60; // seconds - AI generation can take longer
export const dynamic = 'force-dynamic';

const aiActivityRecommendationSchema = z.object({
  name: z.string(),
  category: z.enum(['food', 'entertainment', 'outdoors', 'culture', 'nightlife', 'sports']).default('food'),
  description: z.string().optional().default(''),
  address: z.string().optional().default(''),
  priceRange: z.string().optional().default(''),
  estimatedCost: z.object({
    amount: z.number(),
    per: z.enum(['person', 'group']),
  }).default({ amount: 0, per: 'person' }),
  duration: z.number().optional().default(60),
  bestTime: z.string().optional().default(''),
  bookingRequired: z.boolean().optional().default(false),
  groupFriendly: z.boolean().optional().default(true),
  goodFor: z.array(z.string()).optional().default([]),
  tips: z.string().optional(),
}).passthrough();

const localEventSchema = z.object({
  name: z.string(),
  date: z.string(),
  description: z.string(),
  relevance: z.string(),
});

const activitySuggestionsOutputSchema = z.object({
  recommendations: z.array(aiActivityRecommendationSchema),
  localEvents: z.array(localEventSchema).optional(),
});

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
        { success: false, error: 'Rate limit exceeded. Please wait before requesting more suggestions.' },
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
      const parsed = JSON.parse(jsonMatch[0]);
      const parseValidation = activitySuggestionsOutputSchema.safeParse(parsed);
      if (!parseValidation.success) {
        logError('ACTIVITY_SUGGESTIONS_PARSE_ERROR', new Error('AI response did not match expected schema'), {
          issues: parseValidation.error.flatten(),
        });
        return NextResponse.json(
          { success: false, error: 'Invalid AI response format' },
          { status: 502 }
        );
      }
      recommendations = parseValidation.data;
    } catch (parseError) {
      logError('ACTIVITY_SUGGESTIONS_PARSE_ERROR', parseError);
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
    logError('AI_SUGGEST_ACTIVITIES', error);
    captureException(error, { route: 'POST /api/ai/suggest-activities' });
    return NextResponse.json(
      { success: false, error: 'Failed to generate activity suggestions' },
      { status: 500 }
    );
  }
}

