import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, logger } from '@/lib/logger';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const confirmResetSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

/**
 * POST /api/auth/reset-password
 * Request a password reset token. Always returns 200 to prevent email enumeration.
 */
export async function POST(req: Request) {
  try {
    // Rate limit by IP — first operation before any body parsing
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(authRateLimiter, `reset-password:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();
    const parsed = requestResetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Look up user — do not reveal existence to prevent enumeration
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (user) {
      // Delete any existing reset tokens for this email
      await prisma.verificationToken.deleteMany({
        where: { identifier: `reset:${email}` },
      });

      // Generate a secure reset token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.verificationToken.create({
        data: {
          identifier: `reset:${email}`,
          token,
          expires,
        },
      });

      // Send reset email if email service is configured
      const APP_URL = process.env.NEXTAUTH_URL || 'https://outthegroupchat.com';
      const resetUrl = `${APP_URL}/auth/reset-password/confirm?token=${token}&email=${encodeURIComponent(email)}`;

      // Attempt to send email (non-blocking — log failure but return 200)
      try {
        const { sendPasswordResetEmail } = await import('@/lib/email');
        const emailResult = await sendPasswordResetEmail({
          to: email,
          name: user.name,
          resetUrl,
        });
        if (emailResult.success) {
          logger.info({ email }, '[RESET_PASSWORD] Reset email sent');
        } else {
          logger.warn({ email, resetUrl, emailError: emailResult.error }, '[RESET_PASSWORD] Email not configured — token created but not sent');
        }
      } catch (emailError) {
        logError('RESET_PASSWORD_EMAIL', emailError);
      }
    } else {
      logger.info({ email }, '[RESET_PASSWORD] Reset requested for unknown email — ignoring');
    }

    // Always return 200 to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (error) {
    logError('RESET_PASSWORD_REQUEST', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to process reset request' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/reset-password
 * Confirm password reset with token and new password.
 */
export async function PATCH(req: Request) {
  try {
    // Rate limit by IP — first operation before any body parsing
    const patchIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    const patchRateLimitResult = await checkRateLimit(authRateLimiter, `reset-password-confirm:${patchIp}`);
    if (!patchRateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(patchRateLimitResult) }
      );
    }

    const body = await req.json();
    const parsed = confirmResetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { token, email, password } = parsed.data;

    // Look up the reset token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: {
        identifier_token: {
          identifier: `reset:${email}`,
          token,
        },
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Check token expiry
    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: `reset:${email}`,
            token,
          },
        },
      });
      return NextResponse.json(
        { error: 'Reset token has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Hash the new password and update
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: `reset:${email}`,
            token,
          },
        },
      }),
    ]);

    logger.info({ userId: user.id }, '[RESET_PASSWORD] Password reset successfully');

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    logError('RESET_PASSWORD_CONFIRM', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
