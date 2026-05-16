/**
 * @module api/subcrews/[id]/members/me
 * @description PATCH the caller's own SubCrewMember row (Phase 3 coordination).
 *
 * Currently used to propose a time ("when works?"). Seed members read all
 * proposals on the SubCrew detail page and decide whether to freeze
 * `SubCrew.startAt` via PATCH /api/subcrews/[id].
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { id: string } };

const patchSchema = z.object({
  proposedTime: z.string().datetime({ offset: true }).nullable(),
});

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-member-me:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id } = context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'SubCrew id required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const member = await prisma.subCrewMember.findFirst({
      where: { subCrewId: id, userId: session.user.id },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.subCrewMember.update({
      where: { id: member.id },
      data: {
        proposedTime: parsed.data.proposedTime === null ? null : new Date(parsed.data.proposedTime),
      },
      select: { id: true, proposedTime: true },
    });

    apiLogger.info(
      { subCrewId: id, memberId: member.id, callerId: session.user.id },
      '[SUBCREW_MEMBER_ME_PATCH] proposedTime updated',
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    captureException(error, { route: 'api/subcrews/[id]/members/me', method: 'PATCH' });
    apiLogger.error({ error }, '[SUBCREW_MEMBER_ME_PATCH] Failed to update member');
    return NextResponse.json(
      { success: false, error: 'Failed to update member' },
      { status: 500 },
    );
  }
}
