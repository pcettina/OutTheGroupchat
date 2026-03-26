import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint.
 * Returns minimal service status for uptime monitoring.
 * NODE_ENV and version metadata are intentionally omitted to reduce
 * information exposure to unauthenticated callers.
 */
export async function GET() {
  let databaseStatus: 'connected' | 'error' = 'error';

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = 'connected';
  } catch {
    databaseStatus = 'error';
  }

  const allOk = databaseStatus === 'connected';

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: databaseStatus,
    },
    { status: allOk ? 200 : 503 }
  );
}
