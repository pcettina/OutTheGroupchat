/**
 * @module users/privacy
 * @description Privacy settings API — read and update the authenticated user's
 * default check-in visibility preference stored in User.preferences JSON.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const visibilityValues = ['PUBLIC', 'CREW', 'PRIVATE'] as const;

const updatePrivacySchema = z.object({
  checkInVisibility: z.enum(visibilityValues),
});

type Preferences = {
  checkInVisibility?: string;
  travelStyle?: string;
  interests?: string[];
  budgetRange?: string;
  currency?: string;
  language?: string;
  [key: string]: unknown;
};

function getDefaultPrefs(raw: unknown): Preferences {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Preferences;
  }
  return {};
}

/**
 * GET /api/users/privacy
 * Returns the authenticated user's current check-in visibility preference.
 * Defaults to "CREW" if not previously set.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `privacy-get:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });

    const prefs = getDefaultPrefs(user?.preferences);
    const checkInVisibility = prefs.checkInVisibility ?? 'CREW';

    logger.info({ userId: session.user.id }, '[PRIVACY_GET] Returned privacy settings');

    return NextResponse.json({ success: true, data: { checkInVisibility } });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PRIVACY_GET] Failed to retrieve privacy settings');
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve privacy settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/privacy
 * Updates the authenticated user's default check-in visibility.
 * Merges into existing preferences JSON so other fields are preserved.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `privacy-update:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = updatePrivacySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { checkInVisibility } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });

    const existingPrefs = getDefaultPrefs(user?.preferences);
    const updatedPrefs = { ...existingPrefs, checkInVisibility };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferences: updatedPrefs },
    });

    logger.info(
      { userId: session.user.id, checkInVisibility },
      '[PRIVACY_PATCH] Updated privacy settings'
    );

    return NextResponse.json({ success: true, data: { checkInVisibility } });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PRIVACY_PATCH] Failed to update privacy settings');
    return NextResponse.json(
      { success: false, error: 'Failed to update privacy settings' },
      { status: 500 }
    );
  }
}
