import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logError } from '@/lib/logger';

// DEMO_MODE must be explicitly set to 'true' in the environment to enable this endpoint.
// This prevents demo credentials from being exposed in production environments where the
// env var is absent or set to any other value. Never rely on NODE_ENV alone for this check.
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'alex@demo.com';

// The demo endpoint accepts no body fields. The strict schema (no passthrough)
// rejects any unexpected keys, preventing callers from silently passing data
// that the handler will never use and that could indicate a misuse of this endpoint.
const demoRequestSchema = z.object({}).strict();

// Demo login endpoint - creates or retrieves the demo user
export async function POST(request: NextRequest) {
  try {
    // Validate request body (this endpoint expects no required fields,
    // but we parse and validate to reject malformed JSON payloads early)
    let rawBody: unknown = {};
    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const bodyResult = demoRequestSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: bodyResult.error.flatten() },
        { status: 400 }
      );
    }

    // Guard: DEMO_MODE must be explicitly enabled
    if (process.env.DEMO_MODE !== 'true') {
      return NextResponse.json(
        { success: false, error: 'Demo mode is not enabled' },
        { status: 403 }
      );
    }

    // Guard: DEMO_USER_PASSWORD must be configured — no hardcoded fallback allowed
    const demoPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoPassword) {
      return NextResponse.json(
        { success: false, error: 'Demo configuration is incomplete' },
        { status: 500 }
      );
    }

    // Check if demo user exists
    let user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
    });

    // If not, create the demo user
    if (!user) {
      const hashedPassword = await bcrypt.hash(demoPassword, 10);
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          password: hashedPassword,
          name: 'Alex Johnson',
          city: 'New York, NY',
          bio: '🗽 NYC native | Adventure seeker | Always planning the next escape. Photography enthusiast who believes the best trips are unplanned detours.',
          image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex-johnson',
          preferences: {
            travelStyle: 'adventure',
            interests: ['hiking', 'photography', 'street food', 'live music'],
            budgetRange: { min: 500, max: 1200, currency: 'USD' },
          },
        },
      });
    } else {
      // Update password if it has changed (in case env var was updated)
      const hashedPassword = await bcrypt.hash(demoPassword, 10);
      await prisma.user.update({
        where: { email: DEMO_EMAIL },
        data: { password: hashedPassword },
      });
    }

    // Return credentials for client-side sign-in
    return NextResponse.json({
      success: true,
      credentials: {
        email: DEMO_EMAIL,
        password: demoPassword,
      },
      message: 'Demo account ready. Use these credentials to sign in.',
    });
  } catch (error) {
    logError('DEMO_AUTH', error);
    return NextResponse.json(
      { success: false, error: 'Failed to setup demo account' },
      { status: 500 }
    );
  }
}

// Get demo account info
export async function GET() {
  // Guard: DEMO_MODE must be explicitly enabled
  if (process.env.DEMO_MODE !== 'true') {
    return NextResponse.json(
      { success: false, error: 'Demo mode is not enabled' },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      email: DEMO_EMAIL,
      name: 'Alex Johnson',
      description: 'A demo account to explore all features of OutTheGroupchat',
    },
  });
}
