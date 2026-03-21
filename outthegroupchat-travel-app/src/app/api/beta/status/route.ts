import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Force dynamic rendering — this route reads request.url query params
export const dynamic = 'force-dynamic';

const StatusQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

// In-memory rate limiter: max 10 requests per minute per IP
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkBetaRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anonymous';
    const allowed = checkBetaRateLimit(ip);
    if (!allowed) {
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

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        betaSignupDate: true,
        passwordInitialized: true,
        newsletterSubscribed: true,
        newsletterSubscribedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        exists: false,
        email: normalizedEmail,
      });
    }

    return NextResponse.json({
      exists: true,
      email: user.email,
      betaSignupDate: user.betaSignupDate,
      passwordInitialized: user.passwordInitialized,
      newsletterSubscribed: user.newsletterSubscribed,
      newsletterSubscribedAt: user.newsletterSubscribedAt,
    });
  } catch (error) {
    logger.error({ err: error, context: 'BETA_STATUS' }, 'Error checking beta status');
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}
