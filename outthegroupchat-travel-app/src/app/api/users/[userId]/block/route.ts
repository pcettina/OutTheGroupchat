import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const paramsSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
});

type RouteParams = { params: { userId: string } };

/**
 * POST /api/users/[userId]/block
 * Block `userId` on behalf of the authenticated user.
 *
 * Idempotent: blocking an already-blocked user is a no-op success. Blocking
 * also severs any Crew edge between the two users — the same delete-by-pair
 * that DELETE /api/crew/[id] performs (removes the single row keyed on the
 * lexicographically-sorted `userAId_userBId` pair). Block + sever run in one
 * transaction so the two never diverge.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `user-block:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const blockerId = session.user.id;
    const { userId: blockedId } = parsed.data;

    if (blockerId === blockedId) {
      return NextResponse.json(
        { success: false, error: 'Cannot block yourself' },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Lexicographic sort so (A,B) and (B,A) collapse to one Crew row — mirrors
    // POST /api/crew/request. deleteMany is a no-op when no edge exists, keeping
    // the block idempotent.
    const [userAId, userBId] =
      blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];

    const [block] = await prisma.$transaction([
      prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      prisma.crew.deleteMany({ where: { userAId, userBId } }),
    ]);

    logger.info({ blockerId, blockedId }, '[USER_BLOCK] user blocked');
    return NextResponse.json({ success: true, data: block });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[USER_BLOCK_POST] Failed to block user');
    return NextResponse.json(
      { success: false, error: 'Failed to block user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[userId]/block
 * Unblock `userId`. Idempotent — removing a non-existent block is a no-op
 * success. Does not restore the previously-severed Crew edge.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `user-unblock:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const blockerId = session.user.id;
    const { userId: blockedId } = parsed.data;

    if (blockerId === blockedId) {
      return NextResponse.json(
        { success: false, error: 'Cannot unblock yourself' },
        { status: 400 }
      );
    }

    await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });

    logger.info({ blockerId, blockedId }, '[USER_BLOCK] user unblocked');
    return NextResponse.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[USER_BLOCK_DELETE] Failed to unblock user');
    return NextResponse.json(
      { success: false, error: 'Failed to unblock user' },
      { status: 500 }
    );
  }
}
