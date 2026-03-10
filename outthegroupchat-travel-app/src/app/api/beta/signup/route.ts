import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const BetaSignupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

// API Key validation (set in environment variables)
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

    const body = await req.json();
    const parseResult = BetaSignupSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const { email, name } = parseResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // User exists - update beta signup date if not set
      if (!existingUser.betaSignupDate) {
        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            betaSignupDate: new Date(),
            name: name || existingUser.name,
          },
        });

        logger.info({ userId: updatedUser.id, email }, 'Updated existing user with beta signup date');
        
        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            betaSignupDate: updatedUser.betaSignupDate,
            passwordInitialized: !!updatedUser.password,
          },
        });
      }

      // User already has beta signup
      return NextResponse.json({
        success: true,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          betaSignupDate: existingUser.betaSignupDate,
          passwordInitialized: !!existingUser.password,
        },
      });
    }

    // Create new user without password
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        password: null, // No password yet
        betaSignupDate: new Date(),
        passwordInitialized: false,
        newsletterSubscribed: false, // Default to false, use newsletter endpoint separately
      },
    });

    logger.info({ userId: user.id, email }, 'Created new beta signup user');

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          betaSignupDate: user.betaSignupDate,
          passwordInitialized: false,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error, context: 'BETA_SIGNUP' }, 'Error during beta signup');
    
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Unable to process signup. Please try again.' },
      { status: 500 }
    );
  }
}

