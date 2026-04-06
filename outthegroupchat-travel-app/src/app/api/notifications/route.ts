import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const getNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unread: z.enum(['true', 'false']).optional(),
});

// Get all notifications for current user
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateLimitResult = await checkRateLimit(apiRateLimiter, `notifications:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsedQuery = getNotificationsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }
    const unreadOnly = parsedQuery.data.unread === 'true';
    const { limit } = parsedQuery.data;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        read: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    logger.error({ error }, '[NOTIFICATIONS_GET] Failed to fetch notifications');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// Mark all notifications as read
export async function PATCH(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateLimitResult = await checkRateLimit(apiRateLimiter, `notifications:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error({ error }, '[NOTIFICATIONS_PATCH] Failed to update notifications');
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}

