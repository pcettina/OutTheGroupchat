import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { sendCrewRequestEmail } from '@/lib/email';

const requestSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
});

/**
 * POST /api/crew/request
 * Send a Crew request from the authenticated user to `targetUserId`.
 *
 * Row layout: a single row per user pair with `userAId < userBId`. The
 * DB CHECK constraint enforces the ordering; this route sorts IDs before insert.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-request:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const requesterId = session.user.id;
    const { targetUserId } = parsed.data;

    if (requesterId === targetUserId) {
      return NextResponse.json(
        { success: false, error: 'Cannot send a Crew request to yourself' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Lexicographic sort so (A,B) and (B,A) collapse to one row.
    const [userAId, userBId] =
      requesterId < targetUserId ? [requesterId, targetUserId] : [targetUserId, requesterId];

    const existing = await prisma.crew.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return NextResponse.json(
          { success: false, error: 'Already in Crew with this user' },
          { status: 409 }
        );
      }
      if (existing.status === 'PENDING') {
        return NextResponse.json(
          { success: false, error: 'Request already pending' },
          { status: 409 }
        );
      }
      if (existing.status === 'BLOCKED') {
        // Intentionally opaque to avoid disclosing block status.
        return NextResponse.json(
          { success: false, error: 'Cannot send request to this user' },
          { status: 403 }
        );
      }
      // DECLINED: allow re-request by resetting status and requester.
      const reopened = await prisma.crew.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          requestedById: requesterId,
        },
      });

      await prisma.notification.create({
        data: {
          userId: targetUserId,
          type: 'CREW_REQUEST',
          title: 'New Crew request',
          message: `${session.user.name ?? 'Someone'} wants to add you to their Crew.`,
          data: { crewId: reopened.id, requesterId },
        },
      });

      // Fire-and-forget email.
      if (targetUser.email) {
        const requester = await prisma.user.findUnique({
          where: { id: requesterId },
          select: { name: true, crewLabel: true },
        });
        void sendCrewRequestEmail({
          to: targetUser.email,
          recipientName: targetUser.name,
          senderName: requester?.name ?? 'A new user',
          senderCrewLabel: requester?.crewLabel ?? null,
          crewId: reopened.id,
        }).catch((error) => logger.warn({ error }, '[CREW_REQUEST] email send failed'));
      }

      return NextResponse.json({ success: true, data: reopened }, { status: 201 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { name: true, crewLabel: true },
    });

    const crew = await prisma.crew.create({
      data: {
        userAId,
        userBId,
        status: 'PENDING',
        requestedById: requesterId,
      },
    });

    await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: 'CREW_REQUEST',
        title: 'New Crew request',
        message: `${requester?.name ?? 'Someone'} wants to add you to their Crew.`,
        data: { crewId: crew.id, requesterId },
      },
    });

    if (targetUser.email) {
      void sendCrewRequestEmail({
        to: targetUser.email,
        recipientName: targetUser.name,
        senderName: requester?.name ?? 'A new user',
        senderCrewLabel: requester?.crewLabel ?? null,
        crewId: crew.id,
      }).catch((error) => logger.warn({ error }, '[CREW_REQUEST] email send failed'));
    }

    return NextResponse.json({ success: true, data: crew }, { status: 201 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_REQUEST_POST] Failed to create crew request');
    return NextResponse.json(
      { success: false, error: 'Failed to create Crew request' },
      { status: 500 }
    );
  }
}
