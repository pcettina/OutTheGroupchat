import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
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
        email: email.toLowerCase(),
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
    return NextResponse.json(
      { error: 'Unable to check status' },
      { status: 500 }
    );
  }
}

