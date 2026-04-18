import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { broadcastToMeetup, events } from '@/lib/pusher';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  venueName: z.string().max(200).optional(),
  venueId: z.string().cuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  visibility: z.enum(['PUBLIC', 'CREW', 'INVITE_ONLY', 'PRIVATE']).optional(),
  capacity: z.number().int().positive().optional(),
});

type RouteParams = { params: { id: string } };

/**
 * GET /api/meetups/[id]
 * Fetch full meetup detail including host, venue, attendees, and invite count.
 * Visibility rules:
 *   - Host always sees their own meetup (including cancelled).
 *   - PUBLIC: any authenticated user.
 *   - CREW: caller must have an ACCEPTED Crew record with the host.
 *   - INVITE_ONLY: caller must have a MeetupInvite row for this meetup.
 *   - PRIVATE: host only.
 * Cancelled meetups return 404 for non-hosts.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-detail:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const meetup = await prisma.meetup.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, name: true, image: true } },
        venue: true,
        attendees: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
        invites: { select: { id: true } },
      },
    });

    if (!meetup) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    const isHost = meetup.hostId === userId;

    // Cancelled meetups are hidden from everyone except the host
    if (meetup.cancelled && !isHost) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    // Visibility check for non-hosts
    if (!isHost) {
      if (meetup.visibility === 'PRIVATE') {
        return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
      }

      if (meetup.visibility === 'CREW') {
        const crewRecord = await prisma.crew.findFirst({
          where: {
            status: 'ACCEPTED',
            OR: [
              { userAId: userId, userBId: meetup.hostId },
              { userAId: meetup.hostId, userBId: userId },
            ],
          },
        });
        if (!crewRecord) {
          return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
        }
      }

      if (meetup.visibility === 'INVITE_ONLY') {
        const invite = await prisma.meetupInvite.findUnique({
          where: { meetupId_userId: { meetupId: id, userId } },
        });
        if (!invite) {
          return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
        }
      }
    }

    // Determine calling user's RSVP status
    const myAttendee = meetup.attendees.find((a) => a.userId === userId);

    return NextResponse.json({
      success: true,
      data: {
        ...meetup,
        invitesCount: meetup.invites.length,
        invites: undefined,
        myRsvpStatus: myAttendee?.status ?? null,
      },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_GET] Failed to fetch meetup');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch meetup' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/meetups/[id]
 * Update a meetup. Only the host may edit their meetup.
 * All body fields are optional; only provided fields are changed.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-update:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const meetup = await prisma.meetup.findUnique({ where: { id } });
    if (!meetup) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    if (meetup.hostId !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const {
      title,
      description,
      venueName,
      venueId,
      scheduledAt,
      endsAt,
      visibility,
      capacity,
    } = parsed.data;

    const updated = await prisma.meetup.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(venueName !== undefined && { venueName }),
        ...(venueId !== undefined && { venueId }),
        ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
        ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
        ...(visibility !== undefined && { visibility }),
        ...(capacity !== undefined && { capacity }),
      },
      include: {
        host: { select: { id: true, name: true, image: true } },
        venue: true,
      },
    });

    // Broadcast updated meetup to subscribers. Helper swallows errors internally.
    await broadcastToMeetup(id, events.MEETUP_UPDATED, updated);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_PATCH] Failed to update meetup');
    return NextResponse.json(
      { success: false, error: 'Failed to update meetup' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetups/[id]
 * Soft-cancel a meetup by setting cancelled=true. Only the host may cancel.
 * The row is preserved to maintain attendance history.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-cancel:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const meetup = await prisma.meetup.findUnique({ where: { id } });
    if (!meetup) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    if (meetup.hostId !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await prisma.meetup.update({
      where: { id },
      data: { cancelled: true },
    });

    // Broadcast cancellation to subscribers. Helper swallows errors internally.
    await broadcastToMeetup(id, events.MEETUP_CANCELLED, { meetupId: id });

    return NextResponse.json({ success: true, message: 'Meetup cancelled' });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_DELETE] Failed to cancel meetup');
    return NextResponse.json(
      { success: false, error: 'Failed to cancel meetup' },
      { status: 500 }
    );
  }
}
