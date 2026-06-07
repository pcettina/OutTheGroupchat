import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// Force dynamic rendering — this route reads request.url query params
export const dynamic = 'force-dynamic';

const StatusQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

// Beta status rate limiter — 10 requests per minute per IP, backed by Upstash Redis.
// Falls back to allow-all when Redis env vars are missing (matches the convention in
// src/lib/rate-limit.ts so local dev and tests without UPSTASH_* keys still work).
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.trim();
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const isRedisConfigured = !!(REDIS_URL && REDIS_TOKEN);

const betaStatusRateLimiter: Ratelimit | null = isRedisConfigured
  ? new Ratelimit({
      redis: new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! }),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: 'ratelimit:beta-status',
    })
  : null;

export async function GET(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    const rateLimitResult = await checkRateLimit(
      betaStatusRateLimiter,
      `beta-status:${ip}`
    );
    if (!rateLimitResult.success) {
      logger.warn({ ip, context: 'BETA_STATUS' }, 'Rate limit exceeded');
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
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
    captureException(error, { route: 'api/beta/status', method: 'GET' });
    logger.error({ err: error, context: 'BETA_STATUS' }, 'Error checking beta status');
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}
