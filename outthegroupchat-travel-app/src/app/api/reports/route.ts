import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const createReportSchema = z.object({
  targetType: z.enum(['USER', 'MEETUP']),
  targetId: z.string().min(1),
  reason: z.enum([
    'SPAM',
    'HARASSMENT',
    'INAPPROPRIATE_CONTENT',
    'IMPERSONATION',
    'SAFETY_CONCERN',
    'OTHER',
  ]),
  details: z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED']),
});

/**
 * POST /api/reports
 * File a Trust & Safety report against a USER or a MEETUP on behalf of the
 * authenticated user.
 *
 * Idempotent per (reporter, target): if the reporter already has an *open*
 * report (PENDING or REVIEWED) against the same target, the existing report is
 * returned with 200 rather than creating a duplicate. A genuinely new report
 * returns 201.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const reporterId = session.user.id;

    const rl = await checkRateLimit(apiRateLimiter, `report-create:${reporterId}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { targetType, targetId, reason, details } = parsed.data;

    if (targetType === 'USER' && targetId === reporterId) {
      return NextResponse.json(
        { success: false, error: 'You cannot report yourself' },
        { status: 400 }
      );
    }

    // Verify the target exists before recording a report against it.
    const targetExists =
      targetType === 'USER'
        ? await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
        : await prisma.meetup.findUnique({ where: { id: targetId }, select: { id: true } });

    if (!targetExists) {
      return NextResponse.json(
        { success: false, error: 'Target not found' },
        { status: 404 }
      );
    }

    // Dedupe: collapse repeat reports from the same reporter against the same
    // target while an earlier report is still open (PENDING/REVIEWED).
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        targetType,
        ...(targetType === 'USER'
          ? { targetUserId: targetId }
          : { targetMeetupId: targetId }),
        status: { in: ['PENDING', 'REVIEWED'] },
      },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: existing }, { status: 200 });
    }

    const report = await prisma.report.create({
      data: {
        reporterId,
        targetType,
        targetUserId: targetType === 'USER' ? targetId : null,
        targetMeetupId: targetType === 'MEETUP' ? targetId : null,
        reason,
        details: details ?? null,
      },
    });

    logger.info(
      { reporterId, targetType, targetId, reason },
      '[REPORTS] report created'
    );
    return NextResponse.json({ success: true, data: report }, { status: 201 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[REPORTS_POST] Failed to create report');
    return NextResponse.json(
      { success: false, error: 'Failed to create report' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports
 * Admin-only list of reports, newest first (cap 100). Optional `?status=` filter
 * against the ReportStatus enum.
 *
 * There is no `role`/`isAdmin` column on User, so admin access is gated by an
 * env allowlist (`ADMIN_USER_IDS`, comma-separated). Read inside the handler so
 * tests can stub it; degrades to "no admins" (403) when unset.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!adminIds.includes(session.user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const statusParam = req.nextUrl.searchParams.get('status');
    let status: 'PENDING' | 'REVIEWED' | 'ACTIONED' | 'DISMISSED' | undefined;
    if (statusParam !== null) {
      const parsedQuery = listQuerySchema.safeParse({ status: statusParam });
      if (!parsedQuery.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsedQuery.error.flatten() },
          { status: 400 }
        );
      }
      status = parsedQuery.data.status;
    }

    const reports = await prisma.report.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, data: reports }, { status: 200 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[REPORTS_GET] Failed to list reports');
    return NextResponse.json(
      { success: false, error: 'Failed to list reports' },
      { status: 500 }
    );
  }
}
