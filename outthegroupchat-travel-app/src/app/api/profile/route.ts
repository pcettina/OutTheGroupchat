import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const updateProfileSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  city: z.string().optional(),
  image: z.string().optional(),
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
        preferences: true,
      },
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
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
        preferences: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    logger.error({ error }, '[PROFILE_PUT] Internal error');
    return new NextResponse('Internal error', { status: 500 });
  }
} 