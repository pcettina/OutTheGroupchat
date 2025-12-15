import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Get all invitations for the current user
export async function GET() {
  try {
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
    console.error('[INVITATIONS_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    );
  }
}

