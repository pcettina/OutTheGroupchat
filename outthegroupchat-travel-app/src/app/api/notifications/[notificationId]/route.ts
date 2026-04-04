import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const paramsSchema = z.object({
  notificationId: z.string().cuid(),
});

const patchNotificationSchema = z.object({
  read: z.boolean().optional().default(true),
});

// Mark a single notification as read
export async function PATCH(
  req: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateLimitResult = await checkRateLimit(apiRateLimiter, `notifications:detail:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 });
  }
  const { notificationId } = parsedParams.data;

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.text();
    let bodyJson: unknown = {};
    if (rawBody) {
      try {
        bodyJson = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
      }
    }

    const parsed = patchNotificationSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: parsed.data.read },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, '[NOTIFICATION_PATCH] Failed to update notification');
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

// Delete a notification
export async function DELETE(
  req: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rateLimitResult = await checkRateLimit(apiRateLimiter, `notifications:detail:${ip}`);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 });
  }
  const { notificationId } = parsedParams.data;

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return NextResponse.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error({ error }, '[NOTIFICATION_DELETE] Failed to delete notification');
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
