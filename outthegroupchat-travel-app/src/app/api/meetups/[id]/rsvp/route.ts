import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { broadcastToMeetup, broadcastToUser, events } from '@/lib/pusher';
import { sendMeetupRSVPConfirmationEmail } from '@/lib/email';

const rsvpSchema = z.object({
  status: z.enum(['GOING', 'MAYBE', 'DECLINED']),
});

/**
 * POST /api/meetups/[id]/rsvp
 * RSVP to a meetup. Creates or updates the caller's MeetupAttendee record.
 * Sends a MEETUP_RSVP notification to the host (unless the caller is the host).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-rsvp:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = rsvpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { status } = parsed.data;
    const meetupId = params.id;
    const userId = session.user.id;

    const meetup = await prisma.meetup.findUnique({
      where: { id: meetupId },
      select: {
        id: true,
        title: true,
        hostId: true,
        capacity: true,
        cancelled: true,
        scheduledAt: true,
        venueName: true,
      },
    });

    if (!meetup) {
      return NextResponse.json({ success: false, error: 'Meetup not found' }, { status: 404 });
    }

    if (meetup.cancelled) {
      return NextResponse.json({ success: false, error: 'Meetup is cancelled' }, { status: 400 });
    }

    if (status === 'GOING' && meetup.capacity !== null) {
      const goingCount = await prisma.meetupAttendee.count({
        where: { meetupId, status: 'GOING' },
      });
      if (goingCount >= meetup.capacity) {
        return NextResponse.json({ success: false, error: 'Meetup is at capacity' }, { status: 409 });
      }
    }

    const attendee = await prisma.meetupAttendee.upsert({
      where: { meetupId_userId: { meetupId, userId } },
      create: { meetupId, userId, status },
      update: { status },
    });

    if (userId !== meetup.hostId) {
      const callerName = session.user.name ?? 'Someone';
      await prisma.notification.create({
        data: {
          userId: meetup.hostId,
          type: 'MEETUP_RSVP',
          title: `${callerName} RSVPed ${status} to your meetup`,
          message: `Your meetup "${meetup.title}" has a new RSVP`,
          data: { meetupId, attendeeUserId: userId, attendeeStatus: status },
        },
      });
      logger.info({ meetupId, userId, status }, '[MEETUP_RSVP] Notification sent to host');
    }

    // Broadcast attendee change to the meetup channel + notify host inbox.
    // broadcastToMeetup / broadcastToUser swallow internal errors; awaiting is safe.
    if (status === 'GOING') {
      await broadcastToMeetup(meetupId, events.ATTENDEE_JOINED, {
        userId,
        status,
        user: {
          id: userId,
          name: session.user.name,
          image: session.user.image,
        },
      });
    } else if (status === 'DECLINED') {
      await broadcastToMeetup(meetupId, events.ATTENDEE_LEFT, { userId });
    }

    await broadcastToUser(meetup.hostId, events.NOTIFICATION, {
      type: 'MEETUP_RSVP',
      meetupId,
      attendeeUserId: userId,
      status,
    });

    // Fire-and-forget RSVP confirmation email — failure must not fail the route.
    if (status === 'GOING' && session.user.email) {
      try {
        await sendMeetupRSVPConfirmationEmail({
          to: session.user.email,
          attendeeName: session.user.name ?? 'there',
          meetupTitle: meetup.title,
          meetupDate: meetup.scheduledAt.toISOString(),
          meetupVenueName: meetup.venueName ?? 'TBD',
          status,
          meetupId,
        });
      } catch (emailErr) {
        logger.warn(
          { err: emailErr, meetupId, userId },
          '[MEETUP_RSVP] RSVP confirmation email failed'
        );
      }
    }

    return NextResponse.json(
      { success: true, data: attendee, message: 'RSVP updated' },
      { status: 200 }
    );
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_RSVP_POST] Failed to process RSVP');
    return NextResponse.json({ success: false, error: 'Failed to process RSVP' }, { status: 500 });
  }
}
