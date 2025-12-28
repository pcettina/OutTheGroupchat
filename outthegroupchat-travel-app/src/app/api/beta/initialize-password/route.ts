import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const { email, password, token } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if password already initialized
    if (user.password && user.passwordInitialized) {
      return NextResponse.json(
        { error: 'Password already initialized' },
        { status: 400 }
      );
    }

    // Optional: Validate token if provided (for additional security)
    // You can implement token generation/validation logic here
    // For now, we'll allow direct initialization for beta users

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user with password
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordInitialized: true,
      },
    });

    logger.info({ userId: updatedUser.id, email }, 'Password initialized for beta user');

    // Process any pending invitations (similar to signup flow)
    try {
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: {
          email: email.toLowerCase(),
          expiresAt: { gt: new Date() },
        },
        include: {
          trip: { select: { title: true } },
        },
      });

      if (pendingInvitations.length > 0) {
        for (const pending of pendingInvitations) {
          await prisma.tripInvitation.create({
            data: {
              tripId: pending.tripId,
              userId: updatedUser.id,
              status: 'PENDING',
              expiresAt: pending.expiresAt,
            },
          });

          await prisma.notification.create({
            data: {
              userId: updatedUser.id,
              type: 'TRIP_INVITATION',
              title: 'Trip Invitation',
              message: `You've been invited to join "${pending.trip.title}"!`,
              data: { tripId: pending.tripId },
            },
          });
        }

        await prisma.pendingInvitation.deleteMany({
          where: { email: email.toLowerCase() },
        });

        logger.info({ userId: updatedUser.id, invitationsProcessed: pendingInvitations.length },
          'Processed pending invitations during password initialization');
      }
    } catch (inviteError) {
      logger.error({ err: inviteError, userId: updatedUser.id },
        'Failed to process pending invitations during password initialization');
    }

    return NextResponse.json({
      success: true,
      message: 'Password initialized successfully',
    });
  } catch (error) {
    logger.error({ err: error, context: 'PASSWORD_INIT' }, 'Error during password initialization');
    
    return NextResponse.json(
      { error: 'Unable to initialize password. Please try again.' },
      { status: 500 }
    );
  }
}

