import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getModel } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { logError } from '@/lib/logger';

// ============================================
// TYPES
// ============================================

export interface MeetupSuggestion {
  title: string;
  venue_type: string;
  activity: string;
  duration_minutes: number;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night';
  vibe: string;
  description: string;
}

// ============================================
// SCHEMA DEFINITIONS
// ============================================

const suggestMeetupsSchema = z.object({
  city: z.string().min(2, 'city must be at least 2 characters'),
  theme: z.string().optional(),
  crewSize: z.number().int().min(1).max(20).default(4),
});

const meetupSuggestionSchema = z.object({
  title: z.string(),
  venue_type: z.string(),
  activity: z.string(),
  duration_minutes: z.number(),
  time_of_day: z.enum(['morning', 'afternoon', 'evening', 'late_night']),
  vibe: z.string(),
  description: z.string(),
});

const meetupSuggestionsArraySchema = z.array(meetupSuggestionSchema);

// ============================================
// POST /api/ai/suggest-meetups
// ============================================

/**
 * POST /api/ai/suggest-meetups
 * Generates AI-powered meetup suggestions for a given city and crew.
 * Rate limited to 5 requests per minute per user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(aiRateLimiter, `ai-suggest-meetups:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = suggestMeetupsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { city, theme, crewSize } = parsed.data;

    const prompt = `You are a social event coordinator for ${city}. A group of ${crewSize} friends wants to meet up${theme ? ' with theme: ' + theme : ''}. Suggest 4 creative meetup ideas. Respond with a JSON array of objects with fields: title (string), venue_type (string), activity (string), duration_minutes (number), time_of_day ('morning'|'afternoon'|'evening'|'late_night'), vibe (string), description (string max 80 chars). Return only valid JSON.`;

    const model = getModel('suggestions');
    const { text } = await generateText({ model, prompt });

    let suggestions: MeetupSuggestion[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      const validation = meetupSuggestionsArraySchema.safeParse(parsed);
      if (validation.success) {
        suggestions = validation.data;
      } else {
        logError('AI_SUGGEST_MEETUPS_PARSE', new Error('AI response did not match expected schema'), {
          issues: validation.error.flatten(),
        });
      }
    } catch (parseErr) {
      logError('AI_SUGGEST_MEETUPS_PARSE', new Error('Failed to parse AI meetup suggestions'), {
        parseErr,
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    captureException(error);
    logError('AI_SUGGEST_MEETUPS', error);
    return NextResponse.json({ error: 'Failed to generate meetup suggestions' }, { status: 500 });
  }
}
