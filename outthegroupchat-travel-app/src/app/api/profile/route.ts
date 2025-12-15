import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

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
    console.error('[PROFILE_GET]', error);
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
    const { name, city, bio, preferences } = body;

    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name,
        city,
        bio,
        preferences,
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
    console.error('[PROFILE_PUT]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
} 