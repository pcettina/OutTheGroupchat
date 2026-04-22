import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getModel } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { logError } from '@/lib/logger';

const icebreakersBodySchema = z.object({
  crewMemberId: z.string().min(1, 'crewMemberId is required'),
});

const ICEBREAKERS_PROMPT =
  'Generate 5 fun, casual conversation starters for two people meeting in person for the first time. ' +
  'They are social friends connecting through a meetup app. Keep them light, positive, and suitable ' +
  'for a casual social setting. Return a JSON array of 5 strings.';

/**
 * POST /api/ai/icebreakers
 *
 * Generates 5 icebreaker conversation starters for two Crew members.
 * Requires both users to share an accepted Crew relationship.
 *
 * Rate limit: 10 requests per minute per user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const callerId = session.user.id;

    const rl = await checkRateLimit(aiRateLimiter, `ai-icebreakers:${callerId}`);
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

    const validation = icebreakersBodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { crewMemberId } = validation.data;

    // Verify the two users share an accepted Crew relationship
    const crewRecord = await prisma.crew.findFirst({
      where: {
        OR: [
          { userAId: callerId, userBId: crewMemberId },
          { userAId: crewMemberId, userBId: callerId },
        ],
        status: 'ACCEPTED',
      },
    });

    if (!crewRecord) {
      return NextResponse.json(
        { error: 'You must be Crew members to generate icebreakers' },
        { status: 403 }
      );
    }

    // Fetch crew member's display name for context
    const crewMember = await prisma.user.findUnique({
      where: { id: crewMemberId },
      select: { name: true },
    });

    const memberName = crewMember?.name ?? 'your crew member';

    const prompt = `${ICEBREAKERS_PROMPT}\n\nContext: The two people are ${session.user.name ?? 'someone'} and ${memberName}.`;

    const model = getModel('suggestions');
    const { text } = await generateText({ model, prompt });

    // Parse the returned JSON array from the AI response
    let icebreakers: string[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed: unknown = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
          icebreakers = parsed as string[];
        }
      }
    } catch {
      logError('AI_ICEBREAKERS_PARSE', new Error('Failed to parse icebreakers from AI response'));
    }

    return NextResponse.json({ icebreakers });
  } catch (error) {
    captureException(error);
    logError('AI_ICEBREAKERS', error);
    return NextResponse.json(
      { error: 'Failed to generate icebreakers' },
      { status: 500 }
    );
  }
}
