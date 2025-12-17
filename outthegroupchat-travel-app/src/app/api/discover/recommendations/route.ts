import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Get personalized activity recommendations
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    
    const tripId = searchParams.get('tripId');
    const city = searchParams.get('city') || '';
    const country = searchParams.get('country') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 30);
    
    // Build recommendation context
    let userPreferences: string[] = [];
    let excludeActivityIds: string[] = [];
    let tripDestination: { city?: string; country?: string } = {};

    // Get user preferences if logged in
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true },
      });
      
      if (user?.preferences && typeof user.preferences === 'object') {
        const prefs = user.preferences as { interests?: string[] };
        userPreferences = prefs.interests || [];
      }

      // Get activities user has already saved
      const savedActivities = await prisma.savedActivity.findMany({
        where: { userId: session.user.id },
        select: { activityId: true },
      });
      excludeActivityIds = savedActivities.map(s => s.activityId);
    }

    // Get trip destination if tripId provided
    if (tripId) {
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { destination: true },
      });
      
      if (trip?.destination && typeof trip.destination === 'object') {
        tripDestination = trip.destination as { city?: string; country?: string };
      }
    }

    const targetCity = city || tripDestination.city || '';
    const targetCountry = country || tripDestination.country || '';

    if (!targetCity && !targetCountry) {
      return NextResponse.json(
        { error: 'City or country is required for recommendations' },
        { status: 400 }
      );
    }

    // Get recommendations from internal activities
    const internalRecommendations = await prisma.activity.findMany({
      where: {
        isPublic: true,
        id: { notIn: excludeActivityIds },
        trip: {
          destination: {
            path: ['city'],
            string_contains: targetCity,
          },
        },
      },
      include: {
        trip: {
          select: {
            title: true,
            destination: true,
          },
        },
        _count: {
          select: {
            savedBy: true,
            ratings: true,
          },
        },
      },
      orderBy: [
        { shareCount: 'desc' },
      ],
      take: Math.ceil(limit / 2),
    });

    // Get recommendations from external activities
    let externalRecommendations: unknown[] = [];
    try {
      const externalWhere: Record<string, unknown> = {};
      
      if (targetCity) {
        externalWhere.city = { contains: targetCity, mode: 'insensitive' };
      }
      if (targetCountry) {
        externalWhere.country = { contains: targetCountry, mode: 'insensitive' };
      }

      // Prefer activities matching user interests
      if (userPreferences.length > 0) {
        externalWhere.OR = userPreferences.map(pref => ({
          OR: [
            { category: { contains: pref, mode: 'insensitive' } },
            { tags: { hasSome: [pref.toLowerCase()] } },
          ],
        }));
      }

      const external = await prisma.externalActivity.findMany({
        where: externalWhere,
        orderBy: [
          { popularity: 'desc' },
          { rating: 'desc' },
        ],
        take: Math.ceil(limit / 2),
      });

      externalRecommendations = external.map(activity => ({
        id: activity.id,
        type: 'external',
        externalId: activity.externalId,
        source: activity.source,
        name: activity.name,
        description: activity.description,
        category: activity.category,
        tags: activity.tags,
        location: {
          latitude: activity.latitude,
          longitude: activity.longitude,
          address: activity.address,
          city: activity.city,
          country: activity.country,
        },
        rating: activity.rating,
        priceLevel: activity.priceLevel,
        imageUrl: activity.imageUrl,
        websiteUrl: activity.websiteUrl,
        reason: 'Popular in ' + activity.city,
      }));
    } catch {
      // ExternalActivity table might not exist yet
      console.log('[RECOMMENDATIONS] ExternalActivity table not available');
    }

    // Format internal recommendations
    const formattedInternal = internalRecommendations.map(activity => ({
      id: activity.id,
      type: 'internal',
      name: activity.name,
      description: activity.description,
      category: activity.category,
      location: activity.location,
      cost: activity.cost,
      currency: activity.currency,
      trip: activity.trip,
      engagement: {
        saves: activity._count.savedBy,
        ratings: activity._count.ratings,
      },
      reason: `Recommended from "${activity.trip.title}"`,
    }));

    // Interleave results
    const recommendations = [];
    const maxLen = Math.max(formattedInternal.length, externalRecommendations.length);
    for (let i = 0; i < maxLen && recommendations.length < limit; i++) {
      if (i < formattedInternal.length) {
        recommendations.push(formattedInternal[i]);
      }
      if (i < externalRecommendations.length && recommendations.length < limit) {
        recommendations.push(externalRecommendations[i]);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        recommendations,
        context: {
          city: targetCity,
          country: targetCountry,
          userPreferences,
          tripId,
        },
      },
    });
  } catch (error) {
    console.error('[RECOMMENDATIONS] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}

