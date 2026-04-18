import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { type Prisma, type VenueCategory as PrismaVenueCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { VenueCategory } from '@/types/meetup';

// Force dynamic rendering — reads URL search params per request.
export const dynamic = 'force-dynamic';

const VenueCategoryValues = Object.values(VenueCategory) as [string, ...string[]];

const VenueSearchSchema = z.object({
  q: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  category: z.enum(VenueCategoryValues).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional().default(10),
});

/**
 * GET /api/venues/search
 * Search the Venue table with optional full-text and filter params.
 *
 * Query params:
 *   q        — search name and address (case-insensitive)
 *   city     — filter by city (case-insensitive substring)
 *   category — filter by VenueCategory enum value
 *   limit    — result cap (1–30, default 10)
 *
 * Auth: required (401 if missing session).
 * Rate limit: 60 requests / hour per user via apiRateLimiter.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `venue-search:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawParams = {
      q: searchParams.get('q') ?? undefined,
      city: searchParams.get('city') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    };

    const parsed = VenueSearchSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { q, city, category, limit } = parsed.data;

    // Build Prisma where clause
    const where: Prisma.VenueWhereInput = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (category) {
      where.category = category as PrismaVenueCategory;
    }

    const venues = await prisma.venue.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        country: true,
        category: true,
        latitude: true,
        longitude: true,
        imageUrl: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return NextResponse.json({ success: true, venues });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[VENUES_SEARCH_GET] Failed to search venues');
    return NextResponse.json(
      { success: false, error: 'Failed to search venues' },
      { status: 500 }
    );
  }
}
