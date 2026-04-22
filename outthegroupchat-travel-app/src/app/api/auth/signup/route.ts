import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logger';
import { sendNotificationEmail } from '@/lib/email';
import { authRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

const SignupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

/**
 * Create a VerificationToken in the database and send a verification email.
 * Failures are logged but do NOT propagate — signup succeeds regardless.
 */
async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  try {
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    const appUrl = process.env.NEXTAUTH_URL ?? 'https://outthegroupchat.com';
    const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

    const result = await sendNotificationEmail({
      to: email,
      subject: 'Verify your OutTheGroupchat email address',
      title: 'Verify your email address',
      message:
        'Thanks for signing up! Please verify your email address to unlock all features. The link expires in 24 hours.',
      actionUrl: verifyUrl,
      actionText: 'Verify Email',
    });

    if (!result.success) {
      logger.warn(
        { userId, email, emailError: result.error, context: 'SIGNUP' },
        'Verification email could not be delivered — token is still valid'
      );
    } else {
      logger.info(
        { userId, email, messageId: result.messageId, context: 'SIGNUP' },
        'Verification email sent'
      );
    }
  } catch (err) {
    logger.error(
      { err, userId, email, context: 'SIGNUP' },
      'Failed to create verification token or send verification email'
    );
  }
}

export async function POST(req: Request) {
  try {
    // Rate limit by IP — first operation before any body parsing
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(authRateLimiter, `signup:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();

    // Check for missing required fields first (before format validation)
    if (!body.name || !body.email || !body.password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const parseResult = SignupSchema.safeParse(body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const { name, email, password } = parseResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // If user exists but has no password (beta signup), allow setting password
      if (!existingUser.password) {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Update user with password
        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            name: name || existingUser.name,
            passwordInitialized: true,
          },
        });

        // Process any pending invitations for this email
        try {
          const pendingInvitations = await prisma.pendingInvitation.findMany({
            where: { 
              email,
              expiresAt: { gt: new Date() }, // Only non-expired invitations
            },
            include: {
              trip: { select: { title: true } },
            },
          });

          if (pendingInvitations.length > 0) {
            // Convert pending invitations to real trip invitations
            for (const pending of pendingInvitations) {
              // Create real trip invitation
              await prisma.tripInvitation.create({
                data: {
                  tripId: pending.tripId,
                  userId: updatedUser.id,
                  status: 'PENDING',
                  expiresAt: pending.expiresAt,
                },
              });

              // Create notification
              await prisma.notification.create({
                data: {
                  userId: updatedUser.id,
                  type: 'SYSTEM',
                  title: 'Trip Invitation',
                  message: `You've been invited to join "${pending.trip.title}"!`,
                  data: { tripId: pending.tripId },
                },
              });
            }

            // Delete processed pending invitations
            await prisma.pendingInvitation.deleteMany({
              where: { email },
            });

            logger.info({ userId: updatedUser.id, invitationsProcessed: pendingInvitations.length }, 
              'Processed pending invitations for beta user setting password');
          }
        } catch (inviteError) {
          // Log but don't fail signup if invitation processing fails
          logger.error({ err: inviteError, userId: updatedUser.id }, 
            'Failed to process pending invitations');
        }

        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
          },
        });
      }
      
      // User exists and already has password
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Process any pending invitations for this email
    try {
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: { 
          email,
          expiresAt: { gt: new Date() }, // Only non-expired invitations
        },
        include: {
          trip: { select: { title: true } },
        },
      });

      if (pendingInvitations.length > 0) {
        // Convert pending invitations to real trip invitations
        for (const pending of pendingInvitations) {
          // Create real trip invitation
          await prisma.tripInvitation.create({
            data: {
              tripId: pending.tripId,
              userId: user.id,
              status: 'PENDING',
              expiresAt: pending.expiresAt,
            },
          });

          // Create notification
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'SYSTEM',
              title: 'Trip Invitation',
              message: `You've been invited to join "${pending.trip.title}"!`,
              data: { tripId: pending.tripId },
            },
          });
        }

        // Delete processed pending invitations
        await prisma.pendingInvitation.deleteMany({
          where: { email },
        });

        logger.info({ userId: user.id, invitationsProcessed: pendingInvitations.length },
          'Processed pending invitations for new user');
      }
    } catch (inviteError) {
      // Log but don't fail signup if invitation processing fails
      logger.error({ err: inviteError, userId: user.id },
        'Failed to process pending invitations');
    }

    // Send verification email — failure is non-fatal
    await sendVerificationEmail(user.id, user.email ?? email);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error({ err: error, context: 'SIGNUP' }, 'Error during signup');

    // Handle specific Prisma errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 400 }
        );
      }
    }

    captureException(error);
    return NextResponse.json(
      { error: 'Unable to create account. Please try again.' },
      { status: 500 }
    );
  }
} 