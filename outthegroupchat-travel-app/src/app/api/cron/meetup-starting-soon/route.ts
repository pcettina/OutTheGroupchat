/**
 * @module cron/meetup-starting-soon
 * @description Cron endpoint that runs every 5 minutes to send MEETUP_STARTING_SOON
 * notifications to confirmed attendees of meetups starting within the next ~55–65 minutes.
 * Called by Vercel Cron (see vercel.json). Protected by CRON_SECRET bearer token.
 *
 * Notification logic:
 * - Queries non-cancelled meetups with scheduledAt between T+55 min and T+65 min
 * - For each meetup, finds attendees with RSVP status GOING
 * - Creates a MEETUP_STARTING_SOON in-app notification for each attendee
 * - Sends a reminder email via Resend (if user has an email address)
 * - Broadcasts a Pusher event to the user's personal channel for real-time UI updates
 * - Idempotency: skips users who already have a MEETUP_STARTING_SOON notification
 *   for the same meetupId (JSON path filter on Notification.data.meetupId)
 */
// Protected by CRON_SECRET bearer token — set CRON_SECRET env var before deploying
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { broadcastToUser, events } from '@/lib/pusher';
import { sendMeetupStartingSoonEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * Handles the MEETUP_STARTING_SOON cron trigger.
 * @param req - Incoming Request with Authorization: Bearer {CRON_SECRET} header
 * @returns JSON response with counts of meetups processed and notifications/emails/broadcasts
 *          sent, or an error status (401 Unauthorized, 500 on config/runtime failure)
 */
export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      apiLogger.error({ context: 'CRON_MEETUP_STARTING_SOON' }, 'CRON_SECRET env var not set');
      return NextResponse.json({ error: 'Cron configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      apiLogger.warn({ context: 'CRON_MEETUP_STARTING_SOON' }, 'Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000);  // T+55 min
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);    // T+65 min

    // Find meetups starting in ~1 hour
    const meetups = await prisma.meetup.findMany({
      where: {
        cancelled: false,
        scheduledAt: { gte: windowStart, lte: windowEnd },
      },
      include: {
        host: { select: { id: true, name: true } },
        venue: { select: { name: true } },
        attendees: {
          where: { status: 'GOING' },
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    let notificationsSent = 0;
    let emailsSent = 0;
    let broadcastsSent = 0;
    let skippedAlreadyNotified = 0;

    for (const meetup of meetups) {
      for (const attendee of meetup.attendees) {
        const user = attendee.user;

        // Idempotency: check if we've already notified this user about this meetup
        const existing = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: 'MEETUP_STARTING_SOON',
            data: { path: ['meetupId'], equals: meetup.id },
          },
        });

        if (existing) {
          skippedAlreadyNotified++;
          continue;
        }

        const minutesUntil = Math.round((meetup.scheduledAt.getTime() - now.getTime()) / 60000);
        const venueName = meetup.venue?.name ?? meetup.venueName ?? 'TBA';

        // Create notification
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'MEETUP_STARTING_SOON',
            title: `"${meetup.title}" starts in ~${minutesUntil} min`,
            message: `Your meetup at ${venueName} is starting soon`,
            data: { meetupId: meetup.id, minutesUntil },
          },
        });
        notificationsSent++;

        // Send email (email helper swallows errors internally)
        if (user.email) {
          await sendMeetupStartingSoonEmail({
            to: user.email,
            attendeeName: user.name ?? 'there',
            hostName: meetup.host.name ?? 'Your host',
            meetupTitle: meetup.title,
            meetupDate: meetup.scheduledAt.toISOString(),
            meetupVenueName: venueName,
            minutesUntil,
            meetupId: meetup.id,
          });
          emailsSent++;
        }

        // Pusher broadcast to user's channel (failures are non-fatal inside broadcastToUser)
        await broadcastToUser(user.id, events.NOTIFICATION, {
          type: 'MEETUP_STARTING_SOON',
          meetupId: meetup.id,
          minutesUntil,
        });
        broadcastsSent++;
      }
    }

    apiLogger.info(
      {
        context: 'CRON_MEETUP_STARTING_SOON',
        meetupsProcessed: meetups.length,
        notificationsSent,
        emailsSent,
        broadcastsSent,
        skippedAlreadyNotified,
      },
      'Meetup reminders dispatched'
    );

    return NextResponse.json({
      success: true,
      meetupsProcessed: meetups.length,
      notificationsSent,
      emailsSent,
      broadcastsSent,
      skippedAlreadyNotified,
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ context: 'CRON_MEETUP_STARTING_SOON', error }, 'Cron failed');
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
