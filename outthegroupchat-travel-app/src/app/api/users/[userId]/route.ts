import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';

const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  image: z.string().url().optional(),
  crewLabel: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9 ]+$/, 'crewLabel must be alphanumeric + spaces')
    .nullable()
    .optional(),
});

// Get user profile (public view)
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: session?.user?.id === userId ? true : false,
        image: true,
        bio: true,
        city: true,
        crewLabel: true,
        preferences: true,
        createdAt: true,
        _count: {
          select: {
            ownedTrips: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Count accepted Crew memberships (either side of the pair).
    const crewCount = await prisma.crew.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        crewCount,
      },
    });
  } catch (error) {
    logger.error({ error }, '[USER_GET] Failed to fetch user');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// Update user profile (owner only)
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body: unknown = await req.json();
    const parsed = patchUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, bio, city, image, crewLabel } = parsed.data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(city !== undefined && { city }),
        ...(image !== undefined && { image }),
        ...(crewLabel !== undefined && { crewLabel }),
      },
      select: {
        id: true,
        name: true,
        email: false,
        image: true,
        bio: true,
        city: true,
        crewLabel: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    logger.error({ error }, '[USER_PATCH] Failed to update user');
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
