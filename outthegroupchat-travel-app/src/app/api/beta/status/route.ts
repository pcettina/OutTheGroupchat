import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, authRateLimiter } from '@/lib/rate-limit';

// Force dynamic rendering — this route reads request.url query params
export const dynamic = 'force-dynamic';

const StatusQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

export async function GET(req: NextRequest) {
  try {
    // Use the shared auth rate limiter (5 req/min per IP) to prevent enumeration via brute force.
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';
    const rateLimitResult = await checkRateLimit(authRateLimiter, `beta-status:${ip}`);
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

    // Security: do NOT expose whether the email exists in the database. Return the same
    // response shape regardless of whether the account is found to prevent user enumeration.
    // The client only needs `passwordInitialized` to select the correct onboarding flow; when
    // the account does not exist, false is the appropriate default.
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        passwordInitialized: true,
      },
    });

    return NextResponse.json({
      passwordInitialized: user?.passwordInitialized ?? false,
    });
  } catch (error) {
    logger.error({ err: error, context: 'BETA_STATUS' }, 'Error checking beta status');
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}
