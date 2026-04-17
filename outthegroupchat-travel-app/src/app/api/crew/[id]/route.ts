import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { sendCrewAcceptedEmail } from '@/lib/email';

const patchSchema = z.object({
  action: z.enum(['accept', 'decline', 'block']),
});

type RouteParams = { params: { id: string } };

/**
 * PATCH /api/crew/[id]
 * Update a Crew row. Allowed actions:
 *  - `accept`: recipient accepts a PENDING request → ACCEPTED (+ notify requester)
 *  - `decline`: recipient declines a PENDING request → DECLINED
 *  - `block`: either participant can block → BLOCKED
 * Requester cannot accept/decline their own outgoing request.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-patch:${session.user.id}`);
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
    const { action } = parsed.data;

    const crew = await prisma.crew.findUnique({ where: { id } });
    if (!crew) {
      return NextResponse.json(
        { success: false, error: 'Crew not found' },
        { status: 404 }
      );
    }

    const isParticipant = crew.userAId === userId || crew.userBId === userId;
    if (!isParticipant) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (action === 'accept' || action === 'decline') {
      if (crew.status !== 'PENDING') {
        return NextResponse.json(
          { success: false, error: `Cannot ${action} a request that is not pending` },
          { status: 409 }
        );
      }
      if (crew.requestedById === userId) {
        return NextResponse.json(
          { success: false, error: 'Only the recipient can respond to this request' },
          { status: 403 }
        );
      }

      const nextStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
      const updated = await prisma.crew.update({
        where: { id },
        data: { status: nextStatus },
      });

      if (action === 'accept') {
        const accepter = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, crewLabel: true },
        });
        const requester = await prisma.user.findUnique({
          where: { id: crew.requestedById },
          select: { id: true, name: true, email: true },
        });

        await prisma.notification.create({
          data: {
            userId: crew.requestedById,
            type: 'CREW_ACCEPTED',
            title: 'Crew request accepted',
            message: `${accepter?.name ?? 'Someone'} accepted your Crew request.`,
            data: { crewId: crew.id, accepterId: userId },
          },
        });

        if (requester?.email) {
          void sendCrewAcceptedEmail({
            to: requester.email,
            requesterName: requester.name,
            accepterName: accepter?.name ?? 'A new user',
            accepterCrewLabel: accepter?.crewLabel ?? null,
            crewId: crew.id,
          }).catch((error) => logger.warn({ error }, '[CREW_ACCEPTED] email send failed'));
        }
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // action === 'block'
    const updated = await prisma.crew.update({
      where: { id },
      data: { status: 'BLOCKED' },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_PATCH] Failed to update crew');
    return NextResponse.json(
      { success: false, error: 'Failed to update Crew' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/crew/[id]
 * Remove the Crew row entirely. Either participant may delete a row in any status
 * (PENDING→cancel, ACCEPTED→remove, DECLINED→clean up, BLOCKED→unblock).
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-delete:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const crew = await prisma.crew.findUnique({ where: { id } });
    if (!crew) {
      return NextResponse.json(
        { success: false, error: 'Crew not found' },
        { status: 404 }
      );
    }

    const isParticipant = crew.userAId === userId || crew.userBId === userId;
    if (!isParticipant) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await prisma.crew.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Crew removed' });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_DELETE] Failed to delete crew');
    return NextResponse.json(
      { success: false, error: 'Failed to delete Crew' },
      { status: 500 }
    );
  }
}
