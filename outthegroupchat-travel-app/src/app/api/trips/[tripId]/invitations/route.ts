import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { processInvitations } from '@/lib/invitations';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  emails: z.array(z.string().email()),
  expirationHours: z.number().min(1).max(72).default(24),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a member
    const isMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!isMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    const invitations = await prisma.tripInvitation.findMany({
      where: { tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: invitations });
  } catch (error) {
    logger.error({ err: error, context: 'INVITATIONS_GET' }, 'Failed to fetch invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is trip owner OR admin member
    const [trip, membership] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: tripId },
        select: { ownerId: true, title: true },
      }),
      prisma.tripMember.findFirst({
        where: {
          tripId,
          userId: session.user.id,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      }),
    ]);

    if (!trip) {
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    const isOwner = trip.ownerId === session.user.id;
    if (!isOwner && !membership) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to invite members' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = inviteSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { emails, expirationHours } = validationResult.data;

    const result = await processInvitations({
      tripId,
      tripTitle: trip.title,
      emails,
      inviterId: session.user.id,
      inviterName: session.user.name || 'Someone',
      expirationHours,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ err: error, context: 'INVITATIONS_POST' }, 'Failed to send invitations');
    return NextResponse.json(
      { success: false, error: 'Failed to send invitations' },
      { status: 500 }
    );
  }
}

