import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const createInvitationSchema = z.object({
  tripId: z.string().min(1, 'tripId is required'),
  emails: z.array(z.string().email('Each entry must be a valid email address')).min(1, 'At least one email is required'),
  expirationHours: z.number().int().positive().optional(),
});

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Get all invitations for the current user
export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, `invitations:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invitations = await prisma.tripInvitation.findMany({
      where: { userId: session.user.id },
      include: {
        trip: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check and update expired invitations
    const now = new Date();
    const expiredIds = invitations
      .filter(inv => inv.status === 'PENDING' && inv.expiresAt < now)
      .map(inv => inv.id);

    if (expiredIds.length > 0) {
      await prisma.tripInvitation.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });
    }

    // Return with updated status
    const updatedInvitations = invitations.map(inv => ({
      ...inv,
      status: expiredIds.includes(inv.id) ? 'EXPIRED' : inv.status,
    }));

    return NextResponse.json({ success: true, data: updatedInvitations });
  } catch (error) {
    logger.error({ error }, '[INVITATIONS_GET] Failed to fetch invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

// Create invitations for a trip
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, `invitations:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await req.json();
    const validationResult = createInvitationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { tripId, emails, expirationHours } = validationResult.data;

    // Verify the user owns or is an admin of the trip
    const tripMember = await prisma.tripMember.findFirst({
      where: {
        tripId,
        userId: session.user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
      include: { trip: { select: { title: true, ownerId: true } } },
    });

    if (!tripMember) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to invite members to this trip' },
        { status: 403 }
      );
    }

    const { processInvitations } = await import('@/lib/invitations');

    const result = await processInvitations({
      tripId,
      tripTitle: tripMember.trip.title,
      emails,
      inviterId: session.user.id,
      inviterName: session.user.name ?? 'A trip organizer',
      expirationHours,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, '[INVITATIONS_POST] Failed to create invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to create invitations' },
      { status: 500 }
    );
  }
}
