import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const NewsletterSubscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

// API Key validation (read per-request to support test stubbing)
function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.N8N_API_KEY;
}

export async function POST(req: Request) {
  try {
    // Validate API key
    if (!validateApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, `newsletter:${ip}`);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: getRateLimitHeaders(rateLimitResult) });
    }

    const body = await req.json();
    const parseResult = NewsletterSubscribeSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const { email, name } = parseResult.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Update existing user
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          newsletterSubscribed: true,
          newsletterSubscribedAt: new Date(),
          name: name || existingUser.name,
        },
      });

      logger.info({ userId: updatedUser.id, email }, 'Subscribed existing user to newsletter');

      return NextResponse.json({
        success: true,
        subscribed: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          newsletterSubscribed: updatedUser.newsletterSubscribed,
          newsletterSubscribedAt: updatedUser.newsletterSubscribedAt,
        },
      });
    }

    // Create new user for newsletter (passwordless)
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        password: null,
        newsletterSubscribed: true,
        newsletterSubscribedAt: new Date(),
        passwordInitialized: false,
      },
    });

    logger.info({ userId: user.id, email }, 'Created new newsletter subscriber');

    return NextResponse.json({
      success: true,
      subscribed: true,
      user: {
        id: user.id,
        email: user.email,
        newsletterSubscribed: user.newsletterSubscribed,
        newsletterSubscribedAt: user.newsletterSubscribedAt,
      },
    });
  } catch (error) {
    logger.error({ err: error, context: 'NEWSLETTER_SUBSCRIBE' }, 'Error during newsletter subscription');
    
    return NextResponse.json(
      { error: 'Unable to process subscription. Please try again.' },
      { status: 500 }
    );
  }
}

