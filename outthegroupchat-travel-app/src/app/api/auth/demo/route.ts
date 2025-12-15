import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// Demo credentials from environment variables (security improvement)
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'alex@demo.com';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;

// Check if demo mode is enabled
const isDemoEnabled = (): boolean => {
  // Demo is enabled if password is set OR in development mode
  return !!DEMO_PASSWORD || process.env.NODE_ENV === 'development';
};

// Get demo password (fallback to default only in development)
const getDemoPassword = (): string | null => {
  if (DEMO_PASSWORD) return DEMO_PASSWORD;
  if (process.env.NODE_ENV === 'development') return 'demo123';
  return null;
};

// Demo login endpoint - creates or retrieves the demo user
export async function POST() {
  try {
    // Check if demo mode is enabled
    if (!isDemoEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Demo mode is not enabled' },
        { status: 503 }
      );
    }

    const demoPassword = getDemoPassword();
    if (!demoPassword) {
      return NextResponse.json(
        { success: false, error: 'Demo mode not configured. Set DEMO_USER_PASSWORD environment variable.' },
        { status: 503 }
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
    console.error('[DEMO_AUTH]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to setup demo account' },
      { status: 500 }
    );
  }
}

// Get demo account info (does not expose password in production)
export async function GET() {
  if (!isDemoEnabled()) {
    return NextResponse.json(
      { success: false, error: 'Demo mode is not enabled' },
      { status: 503 }
    );
  }

  const demoPassword = getDemoPassword();
  
  return NextResponse.json({
    success: true,
    data: {
      email: DEMO_EMAIL,
      // Only include password in response if in development mode
      ...(process.env.NODE_ENV === 'development' && demoPassword 
        ? { password: demoPassword } 
        : { password: '[hidden - use POST to get credentials]' }
      ),
      name: 'Alex Johnson',
      description: 'A demo account to explore all features of OutTheGroupchat',
    },
  });
}

