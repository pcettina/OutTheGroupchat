import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getModel, checkRateLimit } from '@/lib/ai/client';

const recommendSchema = z.object({
  userId: z.string().optional(),
  destination: z.string().optional(),
  preferences: z.object({
    interests: z.array(z.string()).optional(),
    budget: z.enum(['budget', 'moderate', 'luxury']).optional(),
    travelStyle: z.enum(['adventure', 'relaxation', 'cultural', 'nightlife', 'mixed']).optional(),
    groupSize: z.number().optional(),
  }).optional(),
  limit: z.number().min(1).max(20).default(10),
});

const recommendationPrompt = `You are a travel activity recommendation engine. Based on user preferences and past activity, suggest personalized travel activities.

Output Format (JSON array):
[
  {
    "name": "Activity name",
    "description": "Why this is perfect for them",
    "category": "FOOD|CULTURE|NATURE|ENTERTAINMENT|NIGHTLIFE|SPORTS|SHOPPING",
    "estimatedCost": 50,
    "duration": "2-3 hours",
    "matchScore": 95,
    "matchReasons": ["Based on interest in X", "Popular with similar travelers"]
  }
]

Consider:
- User's stated interests
- Their travel style preferences
- Budget constraints
- Group size dynamics
- Seasonal relevance
- Popular activities similar travelers enjoyed`;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit(session.user.id, 10, 60000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = recommendSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, destination, preferences, limit } = validation.data;

    // Get user data for personalization
    const user = await prisma.user.findUnique({
      where: { id: userId || session.user.id },
      include: {
        savedActivities: {
          include: { activity: true },
          take: 20,
        },
        tripMemberships: {
          include: {
            trip: {
              include: {
                activities: {
                  where: { status: 'COMPLETED' },
                  take: 10,
                },
              },
            },
          },
          take: 5,
        },
        activityRatings: {
          where: { score: { gte: 4 } },
          include: { activity: true },
          take: 10,
        },
      },
    });

    // Build context for AI
    const userPrefs = user?.preferences as {
      interests?: string[];
      travelStyle?: string;
      budgetRange?: { min: number; max: number };
    } | null;

    const savedCategories = user?.savedActivities
      .map(s => s.activity.category)
      .filter(Boolean);
    
    const highRatedCategories = user?.activityRatings
      .map(r => r.activity.category)
      .filter(Boolean);

    const contextData = {
      destination: destination || 'any destination',
      interests: preferences?.interests || userPrefs?.interests || [],
      travelStyle: preferences?.travelStyle || userPrefs?.travelStyle || 'mixed',
      budget: preferences?.budget || 'moderate',
      groupSize: preferences?.groupSize || 2,
      favoritedCategories: savedCategories || [],
      highRatedCategories: highRatedCategories || [],
    };

    const prompt = `${recommendationPrompt}

USER CONTEXT:
- Destination: ${contextData.destination}
- Interests: ${contextData.interests.join(', ') || 'varied'}
- Travel Style: ${contextData.travelStyle}
- Budget: ${contextData.budget}
- Group Size: ${contextData.groupSize}
- Previously Saved Categories: ${contextData.favoritedCategories.join(', ') || 'none'}
- Highly Rated Categories: ${contextData.highRatedCategories.join(', ') || 'none'}

Generate ${limit} personalized activity recommendations. Return ONLY valid JSON.`;

    const model = getModel('recommendations');
    const { text } = await generateText({
      model,
      prompt,
    });

    // Parse AI response
    let recommendations;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.error('Failed to parse AI recommendations:', text);
      recommendations = [];
    }

    // Enhance with any matching activities from our database
    if (destination) {
      const dbActivities = await prisma.activity.findMany({
        where: {
          isPublic: true,
          trip: {
            destination: {
              path: ['city'],
              string_contains: destination,
            },
          },
        },
        include: {
          ratings: true,
          _count: { select: { savedBy: true, comments: true } },
        },
        take: 5,
      });

      // Add database activities with engagement metrics
      const dbRecommendations = dbActivities.map(activity => ({
        id: activity.id,
        name: activity.name,
        description: activity.description,
        category: activity.category,
        estimatedCost: activity.cost,
        duration: activity.duration ? `${activity.duration} mins` : 'Varies',
        matchScore: 80,
        matchReasons: ['Popular with our community'],
        engagement: {
          saves: activity._count.savedBy,
          comments: activity._count.comments,
          avgRating: activity.ratings.length > 0
            ? activity.ratings.reduce((sum, r) => sum + r.score, 0) / activity.ratings.length
            : null,
        },
        fromDatabase: true,
      }));

      recommendations = [...dbRecommendations, ...recommendations].slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      data: {
        recommendations,
        context: {
          destination: contextData.destination,
          personalized: !!user,
        },
      },
    });
  } catch (error) {
    console.error('[AI_RECOMMEND]', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

// Get recommendations for a specific trip
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');

    if (!tripId) {
      return NextResponse.json(
        { error: 'tripId is required' },
        { status: 400 }
      );
    }

    // Get trip with all context
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        members: {
          include: {
            user: { select: { preferences: true } },
          },
        },
        activities: true,
        survey: {
          include: { responses: true },
        },
      },
    });

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const destination = trip.destination as { city: string };

    // Aggregate member preferences
    const allInterests: string[] = [];
    trip.members.forEach(member => {
      const prefs = member.user.preferences as { interests?: string[] } | null;
      if (prefs?.interests) {
        allInterests.push(...prefs.interests);
      }
    });

    // Count interest frequency
    const interestCounts = allInterests.reduce((acc, interest) => {
      acc[interest] = (acc[interest] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get most common interests
    const topInterests = Object.entries(interestCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([interest]) => interest);

    // Existing activity categories to avoid
    const existingCategories = trip.activities.map(a => a.category);

    const prompt = `${recommendationPrompt}

TRIP CONTEXT:
- Destination: ${destination.city}
- Group Size: ${trip.members.length}
- Trip Dates: ${trip.startDate.toDateString()} to ${trip.endDate.toDateString()}
- Common Group Interests: ${topInterests.join(', ') || 'varied'}
- Already Planned Categories: ${existingCategories.join(', ') || 'none'}

Generate 8 activities that would complement existing plans and appeal to the whole group. Prioritize categories NOT already in their itinerary. Return ONLY valid JSON.`;

    const model = getModel('recommendations');
    const { text } = await generateText({
      model,
      prompt,
    });

    let recommendations;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      recommendations = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        tripId,
        destination: destination.city,
        recommendations,
        groupInterests: topInterests,
      },
    });
  } catch (error) {
    console.error('[AI_RECOMMEND_GET]', error);
    return NextResponse.json(
      { error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}

