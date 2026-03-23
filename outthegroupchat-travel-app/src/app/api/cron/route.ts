// Protected by CRON_SECRET bearer token — set CRON_SECRET env var before deploying
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, apiLogger } from '@/lib/logger';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Vercel Cron Job - runs daily
// Configure in vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 0 * * *" }] }

export async function GET(req: Request) {
  try {
    // Guard: CRON_SECRET must be configured before any auth comparison
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      apiLogger.error({ context: 'CRON' }, 'CRON_SECRET env var is not set');
      return NextResponse.json(
        { error: 'Cron configuration error: CRON_SECRET not set' },
        { status: 500 }
      );
    }

    // Verify cron secret (set in Vercel environment)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      apiLogger.warn({ context: 'CRON' }, 'Unauthorized cron request — invalid or missing bearer token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = {
      expiredInvitations: 0,
      closedSurveys: 0,
      closedVotingSessions: 0,
      notificationsSent: 0,
    };

    const now = new Date();

    // 1. Expire pending invitations
    const expiredInvitations = await prisma.tripInvitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });
    results.expiredInvitations = expiredInvitations.count;

    // 2. Close expired surveys
    const expiredSurveys = await prisma.tripSurvey.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      select: { id: true, tripId: true },
    });

    for (const survey of expiredSurveys) {
      await prisma.tripSurvey.update({
        where: { id: survey.id },
        data: { status: 'CLOSED' },
      });

      // Notify trip owner
      const trip = await prisma.trip.findUnique({
        where: { id: survey.tripId },
        select: { ownerId: true, title: true },
      });

      if (trip) {
        await prisma.notification.create({
          data: {
            userId: trip.ownerId,
            type: 'SURVEY_REMINDER',
            title: 'Survey Closed',
            message: `The survey for "${trip.title}" has been automatically closed.`,
            data: { tripId: survey.tripId, surveyId: survey.id },
          },
        });
      }
    }
    results.closedSurveys = expiredSurveys.length;

    // 3. Close expired voting sessions
    const expiredVotingSessions = await prisma.votingSession.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      select: { id: true, tripId: true, title: true },
    });

    for (const session of expiredVotingSessions) {
      await prisma.votingSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED' },
      });

      // Notify trip members
      const members = await prisma.tripMember.findMany({
        where: { tripId: session.tripId },
        select: { userId: true },
      });

      await prisma.notification.createMany({
        data: members.map(m => ({
          userId: m.userId,
          type: 'VOTE_REMINDER' as const,
          title: 'Voting Closed',
          message: `Voting for "${session.title}" has ended.`,
          data: { tripId: session.tripId, votingSessionId: session.id },
        })),
      });
      results.notificationsSent += members.length;
    }
    results.closedVotingSessions = expiredVotingSessions.length;

    // 4. Send survey reminders (24 hours before expiry)
    const upcomingSurveyExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiringSurveys = await prisma.tripSurvey.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gt: now,
          lt: upcomingSurveyExpiry,
        },
      },
      include: {
        trip: {
          include: {
            members: {
              select: { userId: true },
            },
          },
        },
        responses: {
          select: { userId: true },
        },
      },
    });

    for (const survey of expiringSurveys) {
      const respondedUserIds = new Set(survey.responses.map(r => r.userId));
      const nonRespondents = survey.trip.members.filter(m => !respondedUserIds.has(m.userId));

      for (const member of nonRespondents) {
        // Check if we already sent a reminder today
        const existingReminder = await prisma.notification.findFirst({
          where: {
            userId: member.userId,
            type: 'SURVEY_REMINDER',
            data: {
              path: ['surveyId'],
              equals: survey.id,
            },
            createdAt: {
              gt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        });

        if (!existingReminder) {
          await prisma.notification.create({
            data: {
              userId: member.userId,
              type: 'SURVEY_REMINDER',
              title: 'Survey Expiring Soon',
              message: `Don't forget to complete the survey for "${survey.trip.title}"!`,
              data: { tripId: survey.tripId, surveyId: survey.id },
            },
          });
          results.notificationsSent++;
        }
      }
    }

    // 5. Update trip statuses
    // Mark trips as IN_PROGRESS if start date is today
    await prisma.trip.updateMany({
      where: {
        status: 'BOOKED',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      data: { status: 'IN_PROGRESS' },
    });

    // Mark trips as COMPLETED if end date has passed
    await prisma.trip.updateMany({
      where: {
        status: 'IN_PROGRESS',
        endDate: { lt: now },
      },
      data: { status: 'COMPLETED' },
    });

    return NextResponse.json({
      success: true,
      message: 'Background jobs completed',
      results,
    });
  } catch (error) {
    logError('CRON', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed' },
      { status: 500 }
    );
  }
}

