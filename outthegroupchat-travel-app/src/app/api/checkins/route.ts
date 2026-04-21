import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { triggerCheckinEvent } from '@/lib/pusher';

// ============================================
// CONSTANTS
// ============================================

const MIN_ACTIVE_MINUTES = 30;
const MAX_ACTIVE_HOURS = 12;
const DEFAULT_ACTIVE_HOURS = 6;

// ============================================
// SCHEMA DEFINITIONS
// ============================================

const createCheckInSchema = z.object({
  venueId: z.string().cuid().optional(),
  note: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  activeUntilOverride: z.string().datetime({ offset: true }).optional(),
});

// ============================================
// HELPERS
// ============================================

/**
 * Clamp activeUntil to [now+30min, now+12h].
 * If no override supplied, returns now + 6 hours (default).
 */
function resolveActiveUntil(override?: string): Date {
  const now = new Date();
  const minTime = new Date(now.getTime() + MIN_ACTIVE_MINUTES * 60 * 1000);
  const maxTime = new Date(now.getTime() + MAX_ACTIVE_HOURS * 60 * 60 * 1000);
  const defaultTime = new Date(now.getTime() + DEFAULT_ACTIVE_HOURS * 60 * 60 * 1000);

  if (!override) {
    return defaultTime;
  }

  const requested = new Date(override);

  if (requested < minTime) {
    return minTime;
  }
  if (requested > maxTime) {
    return maxTime;
  }
  return requested;
}

const userSelect = {
  id: true,
  name: true,
  image: true,
} as const;

const venueSelect = {
  id: true,
  name: true,
  city: true,
  category: true,
} as const;

// ============================================
// POST /api/checkins — create a check-in
// ============================================

/**
 * POST /api/checkins
 * Creates a new check-in for the authenticated user and notifies their
 * accepted Crew members via CREW_CHECKED_IN_NEARBY notifications.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkin-create:${session.user.id}`);
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

    const parsed = createCheckInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { venueId, note, latitude, longitude, activeUntilOverride } = parsed.data;
    const callerId = session.user.id;

    const activeUntil = resolveActiveUntil(activeUntilOverride);

    // Create the check-in record
    const checkIn = await prisma.checkIn.create({
      data: {
        userId: callerId,
        venueId,
        note,
        latitude,
        longitude,
        activeUntil,
      },
      include: {
        user: { select: userSelect },
        venue: { select: venueSelect },
      },
    });

    // Resolve accepted Crew partner IDs to notify
    const crewRows = await prisma.crew.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: callerId }, { userBId: callerId }],
      },
      select: { userAId: true, userBId: true },
    });

    const crewPartnerIds = crewRows.map((row) =>
      row.userAId === callerId ? row.userBId : row.userAId
    );

    if (crewPartnerIds.length > 0) {
      await prisma.notification.createMany({
        data: crewPartnerIds.map((partnerId) => ({
          userId: partnerId,
          type: 'CREW_CHECKED_IN_NEARBY' as const,
          title: 'Crew checked in nearby',
          message: `${session.user.name ?? 'Someone in your crew'} just checked in${checkIn.venue ? ` at ${checkIn.venue.name}` : ''}.`,
          data: { checkInId: checkIn.id, userId: callerId },
        })),
        skipDuplicates: true,
      });

      logger.info(
        { checkInId: checkIn.id, notifiedCount: crewPartnerIds.length },
        '[CHECKIN_POST] Crew notified'
      );
    }

    // Broadcast to city Pusher channel (non-fatal)
    if (checkIn.cityId) {
      try {
        await triggerCheckinEvent(checkIn.cityId, 'checkin:new', {
          checkInId: checkIn.id,
          userId: callerId,
          userName: session.user.name ?? null,
          venueName: checkIn.venue?.name ?? null,
          activeUntil: checkIn.activeUntil.toISOString(),
        });
      } catch {
        // Pusher failure is non-fatal
      }
    }

    logger.info({ checkInId: checkIn.id, userId: callerId }, '[CHECKIN_POST] Check-in created');

    return NextResponse.json({ success: true, data: checkIn }, { status: 201 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKIN_POST] Failed to create check-in');
    return NextResponse.json({ success: false, error: 'Failed to create check-in' }, { status: 500 });
  }
}

// ============================================
// GET /api/checkins — caller's own check-ins
// ============================================

const listOwnSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().cuid().optional(),
});

/**
 * GET /api/checkins
 * Returns the authenticated user's own check-ins (all, for profile view),
 * ordered newest first with optional cursor-based pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkin-list:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = listOwnSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { limit, cursor } = parsed.data;
    const callerId = session.user.id;

    const checkIns = await prisma.checkIn.findMany({
      where: {
        userId: callerId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        user: { select: userSelect },
        venue: { select: venueSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasNextPage = checkIns.length > limit;
    const page = hasNextPage ? checkIns.slice(0, limit) : checkIns;
    const nextCursor = hasNextPage ? page[page.length - 1]?.id : undefined;

    logger.info({ callerId, count: page.length }, '[CHECKIN_GET] Listed own check-ins');

    return NextResponse.json({
      success: true,
      data: { checkIns: page, nextCursor },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKIN_GET] Failed to list check-ins');
    return NextResponse.json({ success: false, error: 'Failed to list check-ins' }, { status: 500 });
  }
}
