import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { type Prisma, type VenueCategory as PrismaVenueCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { VenueCategory, type VenueSearchResult } from '@/types/meetup';
import { searchPlaces, mapPlaceToVenue } from '@/lib/api/places';

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
 * Search the Venue table with optional full-text and filter params. When
 * `GOOGLE_PLACES_API_KEY` is configured and a `q` of >=3 chars is provided,
 * the route also calls Google Places Text Search, caches new results into the
 * `Venue` table (source='google_places'), and merges them with the DB rows.
 *
 * Query params:
 *   q        — search name and address (case-insensitive)
 *   city     — filter by city (case-insensitive substring)
 *   category — filter by VenueCategory enum value
 *   limit    — result cap (1–30, default 10)
 *
 * Auth: required (401 if missing session).
 * Rate limit: 60 requests / hour per user via apiRateLimiter.
 *
 * Response shape is stable: `{ success: true, venues: VenueSearchResult[] }`.
 * Places failures are swallowed — on error the route returns DB results only.
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

    const dbVenues: VenueSearchResult[] = await prisma.venue.findMany({
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

    // Decide whether to call Google Places.
    // Conditions: key present, non-empty q with >=3 chars, and we have room
    // (DB returned fewer rows than the requested limit).
    const shouldCallPlaces =
      Boolean(process.env.GOOGLE_PLACES_API_KEY) &&
      typeof q === 'string' &&
      q.trim().length >= 3 &&
      dbVenues.length < limit;

    if (!shouldCallPlaces) {
      return NextResponse.json({ success: true, venues: dbVenues });
    }

    // Call Places (graceful: searchPlaces returns [] on error).
    const placesQuery = city ? `${q} in ${city}` : (q as string);
    const placeResults = await searchPlaces({ query: placesQuery });

    if (placeResults.length === 0) {
      return NextResponse.json({ success: true, venues: dbVenues });
    }

    // Map to Venue shape and apply category filter if present.
    const mapped = placeResults
      .map((p) => mapPlaceToVenue(p, { cityHint: city }))
      .filter((v) => (category ? v.category === category : true));

    // Cache new Places rows into the DB. We do this best-effort: a single
    // failure should not fail the route. Use findFirst+create since the Venue
    // table has no unique constraint on (source, externalId).
    const cachedVenues: VenueSearchResult[] = [];
    for (const candidate of mapped) {
      try {
        const existing = await prisma.venue.findFirst({
          where: { source: candidate.source, externalId: candidate.externalId },
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
        });

        if (existing) {
          cachedVenues.push(existing);
          continue;
        }

        const created = await prisma.venue.create({
          data: {
            name: candidate.name,
            address: candidate.address,
            city: candidate.city,
            country: candidate.country,
            category: candidate.category as PrismaVenueCategory,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            imageUrl: candidate.imageUrl,
            source: candidate.source,
            externalId: candidate.externalId,
          },
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
        });
        cachedVenues.push(created);
      } catch (cacheErr) {
        logger.warn(
          { err: cacheErr, externalId: candidate.externalId },
          '[VENUES_SEARCH_GET] Failed to cache Places result; continuing with next'
        );
      }
    }

    // Merge + dedupe by (lowercase name, lowercase city). DB wins over Places
    // (DB rows may have richer curated data and stable ids). Since cached
    // Places rows are now real DB rows they share the same id space.
    const seen = new Set<string>();
    const merged: VenueSearchResult[] = [];
    const key = (v: VenueSearchResult): string =>
      `${v.name.toLowerCase()}::${v.city.toLowerCase()}`;

    for (const v of dbVenues) {
      const k = key(v);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(v);
    }
    for (const v of cachedVenues) {
      const k = key(v);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(v);
    }

    return NextResponse.json({ success: true, venues: merged.slice(0, limit) });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[VENUES_SEARCH_GET] Failed to search venues');
    return NextResponse.json(
      { success: false, error: 'Failed to search venues' },
      { status: 500 }
    );
  }
}
