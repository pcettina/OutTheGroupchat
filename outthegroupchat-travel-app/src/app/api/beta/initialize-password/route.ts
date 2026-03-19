import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

const InitializePasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  token: z.string().optional(),
});

// API Key validation (read per-request to support test stubbing)
function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.N8N_API_KEY;
}

export async function POST(req: Request) {
  try {
    // Require N8N_API_KEY to prevent unauthenticated account takeover
    if (!validateApiKey(req)) {
      logger.warn({ context: 'PASSWORD_INIT' }, 'Unauthorized attempt to initialize password — invalid API key');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parseResult = InitializePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const { email, password } = parseResult.data;

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

