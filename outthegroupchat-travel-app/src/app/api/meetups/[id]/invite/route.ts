import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { broadcastToMeetup, broadcastToUser, events } from '@/lib/pusher';
import { sendMeetupInviteEmail } from '@/lib/email';

const inviteSchema = z.object({
  userIds: z.array(z.string().cuid()).min(1).max(20),
});

/**
 * POST /api/meetups/[id]/invite
 * Invite crew members to a meetup. Only the host may invite.
 * Skips userIds that already have a MeetupInvite for this meetup.
 * Batch-creates MeetupInvite rows and MEETUP_INVITED notifications.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `meetup-invite:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userIds } = parsed.data;
    const meetupId = params.id;
    const hostId = session.user.id;

    const meetup = await prisma.meetup.findUnique({
      where: { id: meetupId },
      select: {
        id: true,
        title: true,
        hostId: true,
        scheduledAt: true,
        venueName: true,
      },
    });

    if (!meetup) {
      return NextResponse.json({ error: 'Meetup not found' }, { status: 404 });
    }

    if (meetup.hostId !== hostId) {
      return NextResponse.json({ error: 'Only the host can invite members' }, { status: 403 });
    }

    const existingInvites = await prisma.meetupInvite.findMany({
      where: { meetupId, userId: { in: userIds } },
      select: { userId: true },
    });

    const alreadyInvitedSet = new Set(existingInvites.map((inv) => inv.userId));
    const newUserIds = userIds.filter((uid) => !alreadyInvitedSet.has(uid));
    const skippedCount = userIds.length - newUserIds.length;

    if (newUserIds.length > 0) {
      await prisma.meetupInvite.createMany({
        data: newUserIds.map((userId) => ({
          meetupId,
          userId,
          invitedBy: hostId,
          status: 'PENDING' as const,
        })),
        skipDuplicates: true,
      });

      const hostName = session.user.name ?? 'Someone';
      await prisma.notification.createMany({
        data: newUserIds.map((userId) => ({
          userId,
          type: 'MEETUP_INVITED' as const,
          title: `${hostName} invited you to a meetup`,
          message: `You have been invited to "${meetup.title}"`,
          data: { meetupId, invitedBy: hostId },
        })),
      });

      logger.info(
        { meetupId, hostId, invited: newUserIds.length, skipped: skippedCount },
        '[MEETUP_INVITE] Invites and notifications created'
      );

      // Send invite emails fire-and-forget. Failure to fetch users or send any
      // email must not fail the route.
      try {
        const invitedUsers = await prisma.user.findMany({
          where: { id: { in: newUserIds } },
          select: { id: true, email: true, name: true },
        });
        const meetupDateStr = meetup.scheduledAt.toISOString();
        const venueLabel = meetup.venueName ?? 'TBD';
        await Promise.allSettled(
          invitedUsers
            .filter((u) => !!u.email)
            .map((u) =>
              sendMeetupInviteEmail({
                to: u.email as string,
                inviteeName: u.name ?? 'there',
                hostName,
                meetupTitle: meetup.title,
                meetupDate: meetupDateStr,
                meetupVenueName: venueLabel,
                meetupId,
              })
            )
        );
      } catch (emailErr) {
        logger.warn(
          { err: emailErr, meetupId },
          '[MEETUP_INVITE] One or more invite emails failed to dispatch'
        );
      }

      // Broadcast meetup-channel update + per-user notification.
      // broadcast helpers swallow errors internally; awaiting is safe.
      await broadcastToMeetup(meetupId, events.MEETUP_UPDATED, {
        invitesAdded: newUserIds.length,
      });
      await Promise.all(
        newUserIds.map((uid) =>
          broadcastToUser(uid, events.NOTIFICATION, {
            type: 'MEETUP_INVITED',
            meetupId,
          })
        )
      );
    }

    return NextResponse.json(
      { invited: newUserIds.length, skipped: skippedCount },
      { status: 201 }
    );
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[MEETUP_INVITE_POST] Failed to process invites');
    return NextResponse.json({ error: 'Failed to process invites' }, { status: 500 });
  }
}
