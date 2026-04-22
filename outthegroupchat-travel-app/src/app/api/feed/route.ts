import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['all', 'crew', 'trending']).default('all'),
});

// Feed item types for the meetup-centric social feed
type FeedItemType =
  | 'meetup_created'
  | 'check_in_posted'
  | 'crew_formed'
  | 'meetup_attended'
  | 'post_created';

interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  meetup?: {
    id: string;
    title: string;
    venue: string | null;
    scheduledFor: Date;
    status: string;
    visibility: string;
  };
  checkIn?: {
    id: string;
    venue: string | null;
    city: string | null;
    activeUntil: Date;
    visibility: string;
  };
  crew?: {
    id: string;
    userA: { id: string; name: string | null; image: string | null };
    userB: { id: string; name: string | null; image: string | null };
  };
  metadata?: Record<string, unknown>;
}

// Helper: resolve accepted crew partner IDs for a given user
async function getCrewPartnerIds(userId: string): Promise<string[]> {
  const crewRows = await prisma.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });
  return crewRows.map((row) =>
    row.userAId === userId ? row.userBId : row.userAId
  );
}

/**
 * GET /api/feed
 * Returns a unified social feed of meetups and check-ins.
 *
 * feedType 'all'      — PUBLIC items from anyone + CREW-visible items from
 *                       the caller's accepted crew members.
 * feedType 'crew'     — Only items from accepted crew members (PUBLIC or CREW
 *                       visibility).  No public-at-large items.
 * feedType 'trending' — Meetups sorted by attendee count (most popular first).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { searchParams } = new URL(req.url);
    const parsed = feedQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { page, limit, type: feedType } = parsed.data;

    const skip = (page - 1) * limit;

    // Resolve crew partner IDs (empty when logged out)
    const crewPartnerIds: string[] = userId ? await getCrewPartnerIds(userId) : [];

    const now = new Date();
    const feedItems: FeedItem[] = [];

    // -----------------------------------------------------------------------
    // 1. Meetup items (meetup_created)
    // -----------------------------------------------------------------------
    if (feedType === 'trending') {
      // Trending: any PUBLIC meetup, sorted by attendee count descending
      const trendingMeetups = await prisma.meetup.findMany({
        where: {
          cancelled: false,
          scheduledAt: { gte: now },
          visibility: 'PUBLIC',
        },
        include: {
          host: { select: { id: true, name: true, image: true } },
          venue: { select: { name: true, city: true } },
          _count: { select: { attendees: true } },
        },
        orderBy: { attendees: { _count: 'desc' } },
        take: limit,
      });

      for (const meetup of trendingMeetups) {
        feedItems.push({
          id: `meetup-${meetup.id}`,
          type: 'meetup_created',
          timestamp: meetup.createdAt,
          user: meetup.host,
          meetup: {
            id: meetup.id,
            title: meetup.title,
            venue: meetup.venue?.name ?? meetup.venueName ?? null,
            scheduledFor: meetup.scheduledAt,
            status: meetup.cancelled ? 'CANCELLED' : 'SCHEDULED',
            visibility: meetup.visibility,
          },
          metadata: {
            attendeeCount: meetup._count.attendees,
          },
        });
      }
    } else {
      // 'all' or 'crew' — visibility-gated meetup query
      const meetupOrClauses: Prisma.MeetupWhereInput[] = [];

      if (feedType === 'all') {
        // PUBLIC meetups visible to everyone
        meetupOrClauses.push({ visibility: 'PUBLIC' });
      }

      if (crewPartnerIds.length > 0) {
        // CREW-visible meetups hosted by crew members
        meetupOrClauses.push({
          hostId: { in: crewPartnerIds },
          visibility: 'CREW',
        });
        // Also include PUBLIC meetups from crew members when feedType='crew'
        if (feedType === 'crew') {
          meetupOrClauses.push({
            hostId: { in: crewPartnerIds },
            visibility: 'PUBLIC',
          });
        }
      }

      if (meetupOrClauses.length > 0) {
        const recentMeetups = await prisma.meetup.findMany({
          where: {
            cancelled: false,
            scheduledAt: { gte: now },
            OR: meetupOrClauses,
          },
          include: {
            host: { select: { id: true, name: true, image: true } },
            venue: { select: { name: true, city: true } },
            _count: { select: { attendees: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit * 2,
        });

        for (const meetup of recentMeetups) {
          feedItems.push({
            id: `meetup-${meetup.id}`,
            type: 'meetup_created',
            timestamp: meetup.createdAt,
            user: meetup.host,
            meetup: {
              id: meetup.id,
              title: meetup.title,
              venue: meetup.venue?.name ?? meetup.venueName ?? null,
              scheduledFor: meetup.scheduledAt,
              status: meetup.cancelled ? 'CANCELLED' : 'SCHEDULED',
              visibility: meetup.visibility,
            },
            metadata: {
              attendeeCount: meetup._count.attendees,
            },
          });
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Check-in items (check_in_posted) — only for non-trending feeds
    // -----------------------------------------------------------------------
    if (feedType !== 'trending') {
      const checkInOrClauses: Prisma.CheckInWhereInput[] = [];

      if (userId) {
        // Always include own check-ins
        checkInOrClauses.push({ userId });
      }

      if (feedType === 'all') {
        // PUBLIC check-ins from anyone
        checkInOrClauses.push({ visibility: 'PUBLIC' });
      }

      if (crewPartnerIds.length > 0) {
        // PUBLIC + CREW check-ins from crew members
        checkInOrClauses.push({
          userId: { in: crewPartnerIds },
          visibility: 'PUBLIC',
        });
        checkInOrClauses.push({
          userId: { in: crewPartnerIds },
          visibility: 'CREW',
        });
      }

      if (checkInOrClauses.length > 0) {
        const activeCheckIns = await prisma.checkIn.findMany({
          where: {
            activeUntil: { gt: now },
            OR: checkInOrClauses,
          },
          include: {
            user: { select: { id: true, name: true, image: true } },
            venue: { select: { name: true, city: true } },
            city: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        for (const checkIn of activeCheckIns) {
          feedItems.push({
            id: `checkin-${checkIn.id}`,
            type: 'check_in_posted',
            timestamp: checkIn.createdAt,
            user: checkIn.user,
            checkIn: {
              id: checkIn.id,
              venue: checkIn.venue?.name ?? checkIn.venueName ?? null,
              city: checkIn.city?.name ?? checkIn.venue?.city ?? null,
              activeUntil: checkIn.activeUntil,
              visibility: checkIn.visibility,
            },
          });
        }
      }
    }

    // Sort all items by timestamp descending
    feedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const paginatedItems = feedItems.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      data: paginatedItems,
      pagination: {
        page,
        limit,
        total: feedItems.length,
        totalPages: Math.ceil(feedItems.length / limit),
        hasMore: skip + paginatedItems.length < feedItems.length,
      },
    });
  } catch (error) {
    captureException(error);
    logError('FEED_GET', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feed
 * The legacy save/unsave activity endpoint is no longer supported after the
 * social pivot.  Clients should use the dedicated meetup RSVP and check-in
 * routes instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        'This endpoint has been retired. Use /api/meetups/[id]/rsvp or /api/checkins instead.',
    },
    { status: 410 }
  );
}
