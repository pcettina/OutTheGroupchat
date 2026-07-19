import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Optional POST body. Topic selections are signaled via Intents elsewhere, so
 * `topicIds` (if provided) is accepted and validated but not persisted here —
 * the sole side effect of POST is stamping `onboardedAt`.
 */
const completeOnboardingSchema = z.object({
  topicIds: z.array(z.string().min(1)).optional(),
});

/**
 * GET /api/users/onboarding
 * Returns the authenticated user's onboarding status.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uid = session.user.id;

    const rl = await checkRateLimit(apiRateLimiter, `onboarding-get:${uid}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { onboardedAt: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      onboarded: user.onboardedAt !== null,
      onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[ONBOARDING_GET] Failed to read onboarding status');
    return NextResponse.json(
      { success: false, error: 'Failed to read onboarding status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/onboarding
 * Marks the authenticated user as onboarded by stamping `onboardedAt`.
 *
 * Idempotency: overwrite semantics (last-write-wins). Calling twice simply
 * re-stamps `onboardedAt` to the current time and returns 200 both times; the
 * client treats either as "onboarded". Optional `topicIds` is validated but not
 * persisted (topics flow through Intents).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uid = session.user.id;

    const rl = await checkRateLimit(apiRateLimiter, `onboarding-complete:${uid}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    // Body is optional; tolerate an empty/absent body.
    let body: unknown = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = completeOnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const onboardedAt = new Date();
    const updated = await prisma.user.update({
      where: { id: uid },
      data: { onboardedAt },
      select: { onboardedAt: true },
    });

    logger.info({ uid }, '[ONBOARDING] user marked onboarded');

    return NextResponse.json({
      success: true,
      onboardedAt: updated.onboardedAt ? updated.onboardedAt.toISOString() : onboardedAt.toISOString(),
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[ONBOARDING_POST] Failed to complete onboarding');
    return NextResponse.json(
      { success: false, error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}
