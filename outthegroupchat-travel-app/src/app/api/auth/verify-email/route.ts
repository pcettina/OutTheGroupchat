import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { authRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException, captureMessage } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

const VerifyEmailQuerySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export async function GET(req: NextRequest) {
  try {
    // Rate limit by IP — first operation before any query parsing
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rateLimitResult = await checkRateLimit(authRateLimiter, `verify-email:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const { searchParams } = req.nextUrl;
    const rawToken = searchParams.get('token');

    const parseResult = VerifyEmailQuerySchema.safeParse({ token: rawToken });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    const { token } = parseResult.data;

    // Look up the verification token record
    captureMessage('auth: looking up email verification token', 'info');
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      logger.info({ context: 'VERIFY_EMAIL' }, 'Verification token not found');
      return NextResponse.json(
        { error: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Check expiry
    if (verificationToken.expires < new Date()) {
      logger.info(
        { context: 'VERIFY_EMAIL', identifier: verificationToken.identifier },
        'Verification token has expired'
      );
      return NextResponse.json(
        { error: 'Verification token has expired' },
        { status: 400 }
      );
    }

    // The identifier in NextAuth VerificationToken is the user's email
    const userEmail = verificationToken.identifier;

    // Update the user's emailVerified field
    captureMessage('auth: marking user email as verified', 'info');
    await prisma.user.update({
      where: { email: userEmail },
      data: { emailVerified: new Date() },
    });

    // Delete the used verification token
    await prisma.verificationToken.delete({
      where: { token },
    });

    logger.info(
      { context: 'VERIFY_EMAIL', email: userEmail },
      'Email verified successfully'
    );

    return NextResponse.json({ message: 'Email verified successfully' });
  } catch (error) {
    logger.error({ err: error, context: 'VERIFY_EMAIL' }, 'Error verifying email');
    captureException(error, { tags: { route: '/api/auth/verify-email' } });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
