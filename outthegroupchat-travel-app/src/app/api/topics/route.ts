/**
 * @module api/topics
 * @description GET the curated Topic list (R1) — used by the Intent create
 * form's manual-picker fallback when the classifier returns no match. Read-only,
 * authenticated, lightweight (~10 rows).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const topics = await prisma.topic.findMany({
      select: { id: true, slug: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });

    return NextResponse.json({ success: true, data: { topics } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[TOPICS_GET] Failed to list topics');
    return NextResponse.json(
      { success: false, error: 'Failed to list topics' },
      { status: 500 },
    );
  }
}
