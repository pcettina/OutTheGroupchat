import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
  budgetRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string(),
  }).optional(),
  departureCity: z.string().optional(),
});

// Respond to an invitation
export async function POST(
  req: Request,
  { params }: { params: { invitationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { invitationId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invitation = await prisma.tripInvitation.findUnique({
      where: { id: invitationId },
      include: { trip: true },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      );
    }

    if (invitation.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'This invitation is not for you' },
        { status: 403 }
      );
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: `Invitation has already been ${invitation.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.tripInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(
        { success: false, error: 'Invitation has expired' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const validationResult = respondSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, budgetRange, departureCity } = validationResult.data;

    if (action === 'accept') {
      // Update invitation status
      await prisma.tripInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' },
      });

      // Add user as trip member
      await prisma.tripMember.create({
        data: {
          tripId: invitation.tripId,
          userId: session.user.id,
          role: 'MEMBER',
          budgetRange: budgetRange as any,
          departureCity,
        },
      });

      // Notify trip owner
      await prisma.notification.create({
        data: {
          userId: invitation.trip.ownerId,
          type: 'TRIP_UPDATE',
          title: 'Invitation Accepted',
          message: `Someone has accepted your trip invitation!`,
          data: { tripId: invitation.tripId },
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Invitation accepted',
        data: { tripId: invitation.tripId },
      });
    } else {
      // Decline invitation
      await prisma.tripInvitation.update({
        where: { id: invitationId },
        data: { status: 'DECLINED' },
      });

      return NextResponse.json({
        success: true,
        message: 'Invitation declined',
      });
    }
  } catch (error) {
    console.error('[INVITATION_RESPOND]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to respond to invitation' },
      { status: 500 }
    );
  }
}

// Get invitation details
export async function GET(
  req: Request,
  { params }: { params: { invitationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { invitationId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invitation = await prisma.tripInvitation.findUnique({
      where: { id: invitationId },
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
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                  },
                },
              },
            },
            _count: {
              select: {
                members: true,
                activities: true,
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      );
    }

    if (invitation.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'This invitation is not for you' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: invitation });
  } catch (error) {
    console.error('[INVITATION_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitation' },
      { status: 500 }
    );
  }
}

