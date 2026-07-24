import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { z } from 'zod';

// Kept in lockstep with the sibling schema in /api/users/[userId] so the two
// write paths cannot diverge on what a valid profile field is.
// `image` is additionally `.nullable()` here because GET now returns `image`
// and the profile page round-trips the whole object back on save — a user with
// no avatar would otherwise send `image: null` and get a 400.
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  image: z.string().url().nullable().optional(),
  preferences: z.record(z.unknown()).optional(),
});

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        bio: true,
        image: true,
        preferences: true,
      },
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PROFILE_GET] Internal error');
    return new NextResponse('Internal error', { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { name, city, bio, image, preferences } = parsed.data;

    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name,
        city,
        bio,
        image,
        preferences: preferences as Prisma.InputJsonValue | undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        bio: true,
        image: true,
        preferences: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[PROFILE_PUT] Internal error');
    return new NextResponse('Internal error', { status: 500 });
  }
} 