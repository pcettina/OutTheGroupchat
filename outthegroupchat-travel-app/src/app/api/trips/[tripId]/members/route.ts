import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { captureException, addBreadcrumb } from '@/lib/sentry';

const addMemberSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
}).refine((data) => data.userId !== undefined || data.email !== undefined, {
  message: 'At least one of userId or email must be provided',
});

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

export async function POST(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    addBreadcrumb({ category: 'trips.members', message: 'Add member started', level: 'info', data: { tripId } });

    const body = await req.json();
    const validationResult = addMemberSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Check that the requesting user is OWNER or ADMIN
    const requestingMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: session.user.id },
    });

    if (!requestingMember || !['OWNER', 'ADMIN'].includes(requestingMember.role)) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to add members to this trip' },
        { status: 403 }
      );
    }

    const { userId, email, role } = validationResult.data;

    // Resolve the target user
    let targetUserId = userId;
    if (!targetUserId && email) {
      const userByEmail = await prisma.user.findUnique({ where: { email } });
      if (!userByEmail) {
        return NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
      targetUserId = userByEmail.id;
    }

    // Check if already a member
    const existingMember = await prisma.tripMember.findFirst({
      where: { tripId, userId: targetUserId },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: 'User is already a member of this trip' },
        { status: 409 }
      );
    }

    const newMember = await prisma.tripMember.create({
      data: {
        tripId,
        userId: targetUserId as string,
        role: role ?? 'MEMBER',
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

    return NextResponse.json({ success: true, data: newMember }, { status: 201 });
  } catch (error) {
    captureException(error);
    return NextResponse.json(
      { success: false, error: 'Failed to add member' },
      { status: 500 }
    );
  }
}

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

    addBreadcrumb({ category: 'trips.members', message: 'Fetch members started', level: 'info', data: { tripId } });

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
    captureException(error);
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

    addBreadcrumb({ category: 'trips.members', message: 'Update member started', level: 'info', data: { tripId } });

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
        ...(budgetRange && { budgetRange: budgetRange as unknown as Prisma.InputJsonValue }),
        ...(departureCity !== undefined && { departureCity }),
        ...(flightDetails && { flightDetails: flightDetails as unknown as Prisma.InputJsonValue }),
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
    captureException(error);
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

    addBreadcrumb({ category: 'trips.members', message: 'Remove member started', level: 'info', data: { tripId } });

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
    captureException(error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}

