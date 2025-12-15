import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  budgetRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string(),
  }).optional(),
  departureCity: z.string().optional(),
  flightDetails: z.object({
    estimatedCost: z.number(),
    airline: z.string().optional(),
    confirmation: z.string().optional(),
    departureAirport: z.string().optional(),
    arrivalAirport: z.string().optional(),
  }).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const members = await prisma.tripMember.findMany({
      where: { tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            city: true,
            preferences: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('[MEMBERS_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { memberId, ...updateData } = body;

    const validationResult = updateMemberSchema.safeParse(updateData);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Check if user is authorized (owner, admin, or updating their own data)
    const requestingMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!requestingMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    const targetMember = await prisma.tripMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.tripId !== tripId) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Only owner/admin can change roles, but members can update their own budget/flight info
    const isUpdatingSelf = targetMember.userId === session.user.id;
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(requestingMember.role);

    if (validationResult.data.role && !isOwnerOrAdmin) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to change roles' },
        { status: 403 }
      );
    }

    if (!isUpdatingSelf && !isOwnerOrAdmin) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to update this member' },
        { status: 403 }
      );
    }

    const { role, budgetRange, departureCity, flightDetails } = validationResult.data;

    const updatedMember = await prisma.tripMember.update({
      where: { id: memberId },
      data: {
        ...(role && { role }),
        ...(budgetRange && { budgetRange: budgetRange as any }),
        ...(departureCity !== undefined && { departureCity }),
        ...(flightDetails && { flightDetails: flightDetails as any }),
      },
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
    });

    return NextResponse.json({ success: true, data: updatedMember });
  } catch (error) {
    console.error('[MEMBERS_PATCH]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: 'Member ID required' },
        { status: 400 }
      );
    }

    const requestingMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!requestingMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    const targetMember = await prisma.tripMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.tripId !== tripId) {
      return NextResponse.json(
        { success: false, error: 'Member not found' },
        { status: 404 }
      );
    }

    // Cannot remove the owner
    if (targetMember.role === 'OWNER') {
      return NextResponse.json(
        { success: false, error: 'Cannot remove the trip owner' },
        { status: 400 }
      );
    }

    // Users can remove themselves, or owner/admin can remove others
    const isRemovingSelf = targetMember.userId === session.user.id;
    const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(requestingMember.role);

    if (!isRemovingSelf && !isOwnerOrAdmin) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to remove this member' },
        { status: 403 }
      );
    }

    await prisma.tripMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('[MEMBERS_DELETE]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}

