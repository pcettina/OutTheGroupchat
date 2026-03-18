import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Force dynamic rendering — this route reads request.url query params
export const dynamic = 'force-dynamic';

const StatusQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

export async function GET(req: Request) {
  try {
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
