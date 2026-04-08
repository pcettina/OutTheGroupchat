import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

// Force dynamic rendering — this route reads request.url query params
export const dynamic = 'force-dynamic';

const StatusQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, ip);
    if (!rateLimitResult.success) {
      logger.warn({ ip, context: 'BETA_STATUS' }, 'Rate limit exceeded');
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const parseResult = StatusQuerySchema.safeParse({ email });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = parseResult.data.email.toLowerCase();

    // Data minimization: omit betaSignupDate, newsletterSubscribed, newsletterSubscribedAt, and
    // email from the response. Exposing those fields to unauthenticated callers would allow
    // account enumeration and reveal account metadata. Only passwordInitialized is returned
    // because it is required by the client to decide which onboarding flow to show.
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        passwordInitialized: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        exists: false,
        passwordInitialized: false,
      });
    }

    return NextResponse.json({
      exists: true,
      passwordInitialized: user.passwordInitialized,
    });
  } catch (error) {
    logger.error({ err: error, context: 'BETA_STATUS' }, 'Error checking beta status');
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}
