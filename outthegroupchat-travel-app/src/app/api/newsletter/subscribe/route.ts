import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const N8N_API_KEY = process.env.N8N_API_KEY;

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === N8N_API_KEY;
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

    const { email, name } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

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

