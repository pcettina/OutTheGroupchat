import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { MeetupVisibility } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ============================================
// SCHEMA DEFINITIONS
// ============================================

const createMeetupSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  venueId: z.string().cuid().optional(),
  venueName: z.string().max(100).optional(),
  cityId: z.string().cuid().optional(),
  scheduledAt: z
    .string()
    .datetime({ offset: true })
    .refine((val) => new Date(val) > new Date(), {
      message: 'scheduledAt must be in the future',
    }),
  endsAt: z.string().datetime({ offset: true }).optional(),
  visibility: z.nativeEnum(MeetupVisibility).optional().default(MeetupVisibility.CREW),
  capacity: z.number().int().min(2).max(500).optional(),
});

const listMeetupsQuerySchema = z.object({
  cityId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().cuid().optional(),
});

// ============================================
// HELPERS
// ============================================

const hostSelect = {
  id: true,
  name: true,
  image: true,
} as const;

const venueSelect = {
  id: true,
  name: true,
  city: true,
} as const;

// ============================================
// POST /api/meetups — create a meetup
// ============================================

/**
 * POST /api/meetups
 * Creates a new meetup with the authenticated user as host.
 * Rate limited to 10 requests per hour per user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-create:${session.user.id}`);
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

    const parsed = createMeetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, description, venueId, venueName, cityId, scheduledAt, endsAt, visibility, capacity } =
      parsed.data;

    // Validate endsAt is after scheduledAt when both are supplied
    if (endsAt !== undefined && new Date(endsAt) <= new Date(scheduledAt)) {
      return NextResponse.json(
        { success: false, error: 'endsAt must be after scheduledAt' },
        { status: 400 }
      );
    }

    const meetup = await prisma.meetup.create({
      data: {
        title,
        description,
        hostId: session.user.id,
        venueId,
        venueName,
        cityId,
        scheduledAt: new Date(scheduledAt),
        endsAt: endsAt !== undefined ? new Date(endsAt) : undefined,
        visibility,
        capacity,
      },
      include: {
        host: { select: hostSelect },
        venue: { select: venueSelect },
        city: { select: { id: true, name: true, country: true } },
        _count: { select: { attendees: true } },
      },
    });

    logger.info({ meetupId: meetup.id, hostId: session.user.id }, '[MEETUP_POST] Meetup created');

    return NextResponse.json({ success: true, data: meetup }, { status: 201 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_POST] Failed to create meetup');
    return NextResponse.json({ success: false, error: 'Failed to create meetup' }, { status: 500 });
  }
}

// ============================================
// GET /api/meetups — list meetups visible to caller
// ============================================

/**
 * GET /api/meetups
 * Returns meetups visible to the authenticated caller with cursor-based pagination.
 *
 * Visibility rules:
 *  - PUBLIC: always visible
 *  - CREW: visible when the caller and the host share an ACCEPTED Crew row
 *  - INVITE_ONLY: visible when the caller has a MeetupInvite for that meetup
 *  - PRIVATE: only visible to the host
 *
 * Query params: cityId?, limit (1-50, default 20), cursor? (cuid)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-list:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = listMeetupsQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cityId, limit, cursor } = parsed.data;
    const callerId = session.user.id;

    // Resolve accepted crew partner IDs once so we can filter in Prisma
    const acceptedCrewRows = await prisma.crew.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: callerId }, { userBId: callerId }],
      },
      select: { userAId: true, userBId: true },
    });

    const crewPartnerIds = acceptedCrewRows.map((row) =>
      row.userAId === callerId ? row.userBId : row.userAId
    );

    const meetups = await prisma.meetup.findMany({
      where: {
        cancelled: false,
        ...(cityId ? { cityId } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
        OR: [
          // PUBLIC: always visible
          { visibility: MeetupVisibility.PUBLIC },
          // CREW: visible when caller is in the host's crew
          {
            visibility: MeetupVisibility.CREW,
            hostId: { in: crewPartnerIds },
          },
          // CREW meetups the caller themselves hosted
          {
            visibility: MeetupVisibility.CREW,
            hostId: callerId,
          },
          // INVITE_ONLY: visible when caller has a MeetupInvite
          {
            visibility: MeetupVisibility.INVITE_ONLY,
            invites: {
              some: { userId: callerId },
            },
          },
          // PRIVATE: only the host sees it
          {
            visibility: MeetupVisibility.PRIVATE,
            hostId: callerId,
          },
          // Any visibility: host always sees their own meetups
          { hostId: callerId },
        ],
      },
      include: {
        host: { select: hostSelect },
        venue: { select: venueSelect },
        city: { select: { id: true, name: true, country: true } },
        _count: { select: { attendees: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit + 1, // Fetch one extra to determine if there is a next page
    });

    const hasNextPage = meetups.length > limit;
    const page = hasNextPage ? meetups.slice(0, limit) : meetups;
    const nextCursor = hasNextPage ? page[page.length - 1]?.id : undefined;

    logger.info(
      { callerId, cityId, count: page.length },
      '[MEETUP_GET] Listed meetups'
    );

    return NextResponse.json({
      success: true,
      data: { meetups: page, nextCursor },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_GET] Failed to list meetups');
    return NextResponse.json({ success: false, error: 'Failed to list meetups' }, { status: 500 });
  }
}
