import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().optional(),
  destination: z.string().optional(),
  tripType: z.enum(['bachelor', 'bachelorette', 'girls-trip', 'adventure', 'relaxation', 'cultural', 'food', 'nightlife']).optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  groupSizeMin: z.number().optional(),
  groupSizeMax: z.number().optional(),
  duration: z.enum(['weekend', 'short', 'week', 'long']).optional(), // 2-3, 4-5, 6-7, 8+
  sortBy: z.enum(['popular', 'recent', 'rating', 'budget-low', 'budget-high']).default('popular'),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(12),
});

// Pre-defined trip templates
const tripTemplates = [
  {
    id: 'nashville-bachelor',
    title: 'Nashville Bachelor Party',
    description: '3 days of honky-tonks, hot chicken, and Broadway vibes',
    destination: { city: 'Nashville', country: 'USA' },
    duration: 3,
    estimatedBudget: { min: 600, max: 1200, currency: 'USD' },
    tags: ['bachelor', 'nightlife', 'music', 'food'],
    highlights: ['Broadway honky-tonks', 'Hot chicken crawl', 'TopGolf', 'Pedal tavern'],
    image: 'https://images.unsplash.com/photo-1545419913-775e5e0e5561?w=800',
    rating: 4.8,
    usageCount: 342,
  },
  {
    id: 'austin-music',
    title: 'Austin Music Weekend',
    description: '4 days of live music, legendary BBQ, and keeping it weird',
    destination: { city: 'Austin', country: 'USA' },
    duration: 4,
    estimatedBudget: { min: 500, max: 1000, currency: 'USD' },
    tags: ['music', 'food', 'adventure', 'nightlife'],
    highlights: ['6th Street live music', 'Franklin BBQ', 'Barton Springs', 'Rainey Street'],
    image: 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=800',
    rating: 4.7,
    usageCount: 256,
  },
  {
    id: 'miami-beach',
    title: 'Miami Beach Getaway',
    description: '5 days of beach, art, and world-class nightlife',
    destination: { city: 'Miami', country: 'USA' },
    duration: 5,
    estimatedBudget: { min: 1000, max: 2500, currency: 'USD' },
    tags: ['beach', 'nightlife', 'cultural', 'relaxation'],
    highlights: ['South Beach', 'Wynwood Walls', 'LIV at night', 'Cuban food in Little Havana'],
    image: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800',
    rating: 4.6,
    usageCount: 428,
  },
  {
    id: 'scottsdale-spa',
    title: 'Scottsdale Spa Weekend',
    description: '3 days of desert relaxation, spa treatments, and brunches',
    destination: { city: 'Scottsdale', country: 'USA' },
    duration: 3,
    estimatedBudget: { min: 800, max: 1800, currency: 'USD' },
    tags: ['relaxation', 'girls-trip', 'food'],
    highlights: ['World-class spas', 'Desert hiking', 'Old Town shopping', 'Pool parties'],
    image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800',
    rating: 4.9,
    usageCount: 189,
  },
  {
    id: 'colorado-ski',
    title: 'Colorado Ski Adventure',
    description: '4-5 days shredding slopes and après-ski fun',
    destination: { city: 'Denver', country: 'USA' },
    duration: 5,
    estimatedBudget: { min: 1200, max: 3000, currency: 'USD' },
    tags: ['adventure', 'sports'],
    highlights: ['World-class skiing', 'Après-ski bars', 'Mountain views', 'Hot springs'],
    image: 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800',
    rating: 4.8,
    usageCount: 312,
  },
  {
    id: 'nola-jazz',
    title: 'New Orleans Jazz Experience',
    description: '4 days of jazz, beignets, and Southern hospitality',
    destination: { city: 'New Orleans', country: 'USA' },
    duration: 4,
    estimatedBudget: { min: 600, max: 1400, currency: 'USD' },
    tags: ['music', 'cultural', 'food', 'nightlife'],
    highlights: ['French Quarter', 'Jazz on Frenchmen Street', 'Café Du Monde', 'Garden District'],
    image: 'https://images.unsplash.com/photo-1568454537842-d933259bb9db?w=800',
    rating: 4.7,
    usageCount: 267,
  },
  {
    id: 'vegas-birthday',
    title: 'Vegas Birthday Bash',
    description: '3 days of shows, clubs, and unforgettable moments',
    destination: { city: 'Las Vegas', country: 'USA' },
    duration: 3,
    estimatedBudget: { min: 800, max: 2500, currency: 'USD' },
    tags: ['bachelor', 'bachelorette', 'nightlife'],
    highlights: ['World-class shows', 'Rooftop pools', 'Fine dining', 'Nightclubs'],
    image: 'https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?w=800',
    rating: 4.5,
    usageCount: 523,
  },
  {
    id: 'charleston-getaway',
    title: 'Charleston Weekend',
    description: '3 days of Southern charm, history, and incredible food',
    destination: { city: 'Charleston', country: 'USA' },
    duration: 3,
    estimatedBudget: { min: 500, max: 1200, currency: 'USD' },
    tags: ['cultural', 'food', 'relaxation'],
    highlights: ['Historic District', 'Lowcountry cuisine', 'Beach day trips', 'Ghost tours'],
    image: 'https://images.unsplash.com/photo-1569880153113-76e33fc52d5f?w=800',
    rating: 4.8,
    usageCount: 178,
  },
];

// Popular destinations
const popularDestinations = [
  { city: 'Nashville', country: 'USA', tripCount: 342, topType: 'bachelor' },
  { city: 'Miami', country: 'USA', tripCount: 428, topType: 'beach' },
  { city: 'Austin', country: 'USA', tripCount: 256, topType: 'music' },
  { city: 'Las Vegas', country: 'USA', tripCount: 523, topType: 'nightlife' },
  { city: 'New Orleans', country: 'USA', tripCount: 267, topType: 'cultural' },
  { city: 'Denver', country: 'USA', tripCount: 312, topType: 'adventure' },
  { city: 'Scottsdale', country: 'USA', tripCount: 189, topType: 'relaxation' },
  { city: 'San Diego', country: 'USA', tripCount: 203, topType: 'beach' },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Parse query params
    const params = {
      query: searchParams.get('query') || undefined,
      destination: searchParams.get('destination') || undefined,
      tripType: searchParams.get('tripType') || undefined,
      budgetMin: searchParams.get('budgetMin') ? Number(searchParams.get('budgetMin')) : undefined,
      budgetMax: searchParams.get('budgetMax') ? Number(searchParams.get('budgetMax')) : undefined,
      sortBy: searchParams.get('sortBy') || 'popular',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 12,
    };

    const validation = searchSchema.safeParse(params);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { query, destination, tripType, sortBy, page, limit } = validation.data;
    const skip = (page - 1) * limit;

    // Build query for public trips
    const whereClause: Record<string, unknown> = {
      isPublic: true,
      status: { in: ['COMPLETED', 'IN_PROGRESS', 'BOOKED'] },
    };

    if (destination) {
      whereClause.destination = {
        path: ['city'],
        string_contains: destination,
      };
    }

    // Get trips from database
    const [trips, totalCount] = await Promise.all([
      prisma.trip.findMany({
        where: whereClause,
        include: {
          owner: { select: { name: true, image: true } },
          members: { select: { id: true } },
          activities: {
            where: { isPublic: true },
            take: 3,
          },
          _count: { select: { activities: true } },
        },
        orderBy: sortBy === 'recent' 
          ? { createdAt: 'desc' }
          : sortBy === 'popular' 
          ? { viewCount: 'desc' }
          : { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.trip.count({ where: whereClause }),
    ]);

    // Get trending activities
    const trendingActivities = await prisma.activity.findMany({
      where: { isPublic: true },
      include: {
        ratings: true,
        _count: { select: { savedBy: true, comments: true } },
        trip: {
          select: {
            destination: true,
          },
        },
      },
      orderBy: [
        { shareCount: 'desc' },
      ],
      take: 8,
    });

    // Filter templates by search criteria
    let filteredTemplates = tripTemplates;
    
    if (query) {
      const queryLower = query.toLowerCase();
      filteredTemplates = filteredTemplates.filter(t =>
        t.title.toLowerCase().includes(queryLower) ||
        t.description.toLowerCase().includes(queryLower) ||
        t.destination.city.toLowerCase().includes(queryLower) ||
        t.tags.some(tag => tag.includes(queryLower))
      );
    }
    
    if (destination) {
      filteredTemplates = filteredTemplates.filter(t =>
        t.destination.city.toLowerCase().includes(destination.toLowerCase())
      );
    }
    
    if (tripType) {
      filteredTemplates = filteredTemplates.filter(t =>
        t.tags.includes(tripType)
      );
    }

    // Sort templates
    if (sortBy === 'popular') {
      filteredTemplates.sort((a, b) => b.usageCount - a.usageCount);
    } else if (sortBy === 'rating') {
      filteredTemplates.sort((a, b) => b.rating - a.rating);
    }

    return NextResponse.json({
      success: true,
      data: {
        // User-created public trips
        trips: trips.map(trip => ({
          id: trip.id,
          title: trip.title,
          description: trip.description,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          memberCount: trip.members.length,
          activityCount: trip._count.activities,
          activities: trip.activities.map(a => ({
            name: a.name,
            category: a.category,
          })),
          owner: trip.owner,
          status: trip.status,
        })),
        totalTrips: totalCount,
        
        // Pre-built templates
        templates: filteredTemplates,
        
        // Popular destinations
        destinations: popularDestinations,
        
        // Trending activities
        trending: trendingActivities.map(activity => ({
          id: activity.id,
          name: activity.name,
          description: activity.description,
          category: activity.category,
          destination: (activity.trip.destination as { city: string }).city,
          avgRating: activity.ratings.length > 0
            ? activity.ratings.reduce((sum, r) => sum + r.score, 0) / activity.ratings.length
            : null,
          saveCount: activity._count.savedBy,
          commentCount: activity._count.comments,
        })),
        
        // Pagination
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: skip + trips.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error('[INSPIRATION_GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch inspiration' },
      { status: 500 }
    );
  }
}

// Get a specific template
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { templateId, action } = body;

    if (action === 'get-template') {
      const template = tripTemplates.find(t => t.id === templateId);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: {
          ...template,
          suggestedItinerary: generateSuggestedItinerary(template),
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[INSPIRATION_POST]', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Helper to generate suggested activities for a template
function generateSuggestedItinerary(template: typeof tripTemplates[0]) {
  const activities = {
    'nashville-bachelor': [
      { day: 1, name: 'Arrive & settle in', time: '15:00', type: 'logistics' },
      { day: 1, name: 'Broadway bar crawl', time: '20:00', type: 'nightlife' },
      { day: 2, name: 'Brunch at Hattie B\'s', time: '11:00', type: 'food' },
      { day: 2, name: 'TopGolf', time: '14:00', type: 'activity' },
      { day: 2, name: 'Pedal tavern tour', time: '17:00', type: 'activity' },
      { day: 2, name: 'Kid Rock\'s Big Ass Honky Tonk', time: '21:00', type: 'nightlife' },
      { day: 3, name: 'Recovery brunch', time: '12:00', type: 'food' },
      { day: 3, name: 'Depart', time: '15:00', type: 'logistics' },
    ],
    'austin-music': [
      { day: 1, name: 'Check-in & explore downtown', time: '15:00', type: 'logistics' },
      { day: 1, name: 'Rainey Street', time: '20:00', type: 'nightlife' },
      { day: 2, name: 'Franklin BBQ (get there early!)', time: '09:00', type: 'food' },
      { day: 2, name: 'Barton Springs', time: '14:00', type: 'activity' },
      { day: 2, name: '6th Street live music', time: '21:00', type: 'entertainment' },
      { day: 3, name: 'Tacos & coffee', time: '10:00', type: 'food' },
      { day: 3, name: 'South Congress shopping', time: '13:00', type: 'activity' },
      { day: 3, name: 'Rooftop sunset drinks', time: '18:00', type: 'nightlife' },
      { day: 4, name: 'Brunch & depart', time: '11:00', type: 'food' },
    ],
    'miami-beach': [
      { day: 1, name: 'Hotel check-in', time: '14:00', type: 'logistics' },
      { day: 1, name: 'South Beach sunset', time: '18:00', type: 'activity' },
      { day: 1, name: 'Dinner in Wynwood', time: '20:00', type: 'food' },
      { day: 2, name: 'Beach morning', time: '09:00', type: 'activity' },
      { day: 2, name: 'Pool party', time: '14:00', type: 'nightlife' },
      { day: 2, name: 'LIV or E11even', time: '23:00', type: 'nightlife' },
      { day: 3, name: 'Recovery brunch', time: '12:00', type: 'food' },
      { day: 3, name: 'Wynwood Walls & galleries', time: '15:00', type: 'culture' },
      { day: 3, name: 'Little Havana dinner', time: '19:00', type: 'food' },
      { day: 4, name: 'Spa morning', time: '10:00', type: 'wellness' },
      { day: 4, name: 'Key Biscayne', time: '14:00', type: 'activity' },
      { day: 5, name: 'Depart', time: '12:00', type: 'logistics' },
    ],
  };

  return activities[template.id as keyof typeof activities] || [];
}

