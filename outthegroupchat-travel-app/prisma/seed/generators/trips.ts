import { PrismaClient, TripStatus } from '@prisma/client';

export interface DemoTrip {
  title: string;
  description: string;
  destination: {
    city: string;
    country: string;
    coordinates: { lat: number; lng: number };
    timezone: string;
  };
  startDate: Date;
  endDate: Date;
  status: TripStatus;
  budget: {
    total: number;
    currency: string;
    breakdown?: {
      accommodation: number;
      food: number;
      activities: number;
      transport: number;
    };
  };
  isPublic: boolean;
  ownerEmail: string;
  memberEmails: string[];
  tags?: string[];
}

// Helper to get dates relative to today
const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const daysBefore = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export const demoTrips: DemoTrip[] = [
  // PLANNING trips (2)
  {
    title: 'Nashville Bachelor Party',
    description: 'Last hurrah before Jake ties the knot! 3 days of honky-tonks, hot chicken, and questionable decisions on Broadway.',
    destination: {
      city: 'Nashville',
      country: 'USA',
      coordinates: { lat: 36.1627, lng: -86.7816 },
      timezone: 'America/Chicago',
    },
    startDate: daysFromNow(45),
    endDate: daysFromNow(48),
    status: 'PLANNING',
    budget: { total: 3000, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'alex@demo.com',
    memberEmails: ['jordan@demo.com', 'casey@demo.com', 'drew@demo.com'],
    tags: ['bachelor', 'nightlife', 'music'],
  },
  {
    title: 'Girls Trip: Scottsdale Spa Weekend',
    description: 'Self-care szn! Spa treatments, poolside margaritas, and maybe some hiking if we feel ambitious.',
    destination: {
      city: 'Scottsdale',
      country: 'USA',
      coordinates: { lat: 33.4942, lng: -111.9261 },
      timezone: 'America/Phoenix',
    },
    startDate: daysFromNow(60),
    endDate: daysFromNow(63),
    status: 'PLANNING',
    budget: { total: 2500, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'riley@demo.com',
    memberEmails: ['taylor@demo.com', 'avery@demo.com', 'quinn@demo.com'],
    tags: ['girls-trip', 'spa', 'relaxation'],
  },

  // SURVEYING trips (2)
  {
    title: 'Austin Music & BBQ Crawl',
    description: 'Live music capital meets BBQ heaven. Help us decide: Franklin vs La Barbecue vs Micklethwait?',
    destination: {
      city: 'Austin',
      country: 'USA',
      coordinates: { lat: 30.2672, lng: -97.7431 },
      timezone: 'America/Chicago',
    },
    startDate: daysFromNow(30),
    endDate: daysFromNow(33),
    status: 'SURVEYING',
    budget: { total: 2000, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'casey@demo.com',
    memberEmails: ['alex@demo.com', 'drew@demo.com', 'reese@demo.com'],
    tags: ['music', 'food', 'austin'],
  },
  {
    title: 'Colorado Ski Trip',
    description: 'Shredding the slopes by day, après-ski by night. Vote on: Vail, Breckenridge, or Aspen?',
    destination: {
      city: 'Denver',
      country: 'USA',
      coordinates: { lat: 39.7392, lng: -104.9903 },
      timezone: 'America/Denver',
    },
    startDate: daysFromNow(75),
    endDate: daysFromNow(79),
    status: 'SURVEYING',
    budget: { total: 4000, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'sam@demo.com',
    memberEmails: ['jamie@demo.com', 'morgan@demo.com', 'emery@demo.com'],
    tags: ['skiing', 'winter', 'adventure'],
  },

  // VOTING trips (2)
  {
    title: 'Miami Art Basel Weekend',
    description: 'Art by day, clubs by night. Currently voting on which Wynwood galleries to hit!',
    destination: {
      city: 'Miami',
      country: 'USA',
      coordinates: { lat: 25.7617, lng: -80.1918 },
      timezone: 'America/New_York',
    },
    startDate: daysFromNow(20),
    endDate: daysFromNow(23),
    status: 'VOTING',
    budget: { total: 3500, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'avery@demo.com',
    memberEmails: ['riley@demo.com', 'taylor@demo.com', 'dakota@demo.com'],
    tags: ['art', 'nightlife', 'miami'],
  },
  {
    title: 'NOLA Jazz Fest Adventure',
    description: 'Jazz Fest season! Vote on which stages and which po\'boy spots.',
    destination: {
      city: 'New Orleans',
      country: 'USA',
      coordinates: { lat: 29.9511, lng: -90.0715 },
      timezone: 'America/Chicago',
    },
    startDate: daysFromNow(40),
    endDate: daysFromNow(44),
    status: 'VOTING',
    budget: { total: 2200, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'skyler@demo.com',
    memberEmails: ['morgan@demo.com', 'reese@demo.com', 'frankie@demo.com'],
    tags: ['jazz', 'festival', 'food'],
  },

  // BOOKED trips (1)
  {
    title: 'Vegas Birthday Bash',
    description: 'Dakota\'s 30th! Flights booked, suite secured, liver prepared.',
    destination: {
      city: 'Las Vegas',
      country: 'USA',
      coordinates: { lat: 36.1699, lng: -115.1398 },
      timezone: 'America/Los_Angeles',
    },
    startDate: daysFromNow(14),
    endDate: daysFromNow(17),
    status: 'BOOKED',
    budget: {
      total: 4500,
      currency: 'USD',
      breakdown: { accommodation: 1800, food: 800, activities: 1200, transport: 700 },
    },
    isPublic: true,
    ownerEmail: 'dakota@demo.com',
    memberEmails: ['blake@demo.com', 'jordan@demo.com', 'cameron@demo.com'],
    tags: ['birthday', 'vegas', 'nightlife'],
  },

  // IN_PROGRESS trips (1)
  {
    title: 'San Diego Surf & Tacos',
    description: 'Currently living our best lives! Check the feed for updates 🌊🌮',
    destination: {
      city: 'San Diego',
      country: 'USA',
      coordinates: { lat: 32.7157, lng: -117.1611 },
      timezone: 'America/Los_Angeles',
    },
    startDate: daysBefore(1),
    endDate: daysFromNow(3),
    status: 'IN_PROGRESS',
    budget: { total: 1800, currency: 'USD' },
    isPublic: true,
    ownerEmail: 'cameron@demo.com',
    memberEmails: ['jordan@demo.com', 'riley@demo.com'],
    tags: ['beach', 'surfing', 'tacos'],
  },

  // COMPLETED trips (2)
  {
    title: 'Charleston Weekend Getaway',
    description: 'Southern charm overload! Amazing food, beautiful architecture, and way too many mimosas.',
    destination: {
      city: 'Charleston',
      country: 'USA',
      coordinates: { lat: 32.7765, lng: -79.9311 },
      timezone: 'America/New_York',
    },
    startDate: daysBefore(45),
    endDate: daysBefore(42),
    status: 'COMPLETED',
    budget: {
      total: 2100,
      currency: 'USD',
      breakdown: { accommodation: 700, food: 600, activities: 500, transport: 300 },
    },
    isPublic: true,
    ownerEmail: 'taylor@demo.com',
    memberEmails: ['alex@demo.com', 'morgan@demo.com'],
    tags: ['southern', 'food', 'history'],
  },
  {
    title: 'Portland Brewery Tour',
    description: 'Hit 12 breweries in 3 days. Would recommend. Would do again. Liver has recovered.',
    destination: {
      city: 'Portland',
      country: 'USA',
      coordinates: { lat: 45.5152, lng: -122.6784 },
      timezone: 'America/Los_Angeles',
    },
    startDate: daysBefore(30),
    endDate: daysBefore(27),
    status: 'COMPLETED',
    budget: {
      total: 1500,
      currency: 'USD',
      breakdown: { accommodation: 500, food: 400, activities: 400, transport: 200 },
    },
    isPublic: true,
    ownerEmail: 'quinn@demo.com',
    memberEmails: ['sam@demo.com', 'jamie@demo.com', 'emery@demo.com'],
    tags: ['brewery', 'portland', 'beer'],
  },
];

export async function seedTrips(
  prisma: PrismaClient,
  userIdMap: Map<string, string>
): Promise<Map<string, string>> {
  console.log('✈️  Creating demo trips...');
  
  const tripIdMap = new Map<string, string>();
  
  for (const tripData of demoTrips) {
    const ownerId = userIdMap.get(tripData.ownerEmail);
    if (!ownerId) {
      console.warn(`   ⚠️  Owner not found: ${tripData.ownerEmail}`);
      continue;
    }
    
    const trip = await prisma.trip.create({
      data: {
        title: tripData.title,
        description: tripData.description,
        destination: tripData.destination,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        status: tripData.status,
        budget: tripData.budget,
        isPublic: tripData.isPublic,
        ownerId,
        members: {
          create: [
            { userId: ownerId, role: 'OWNER' },
            ...tripData.memberEmails.map(email => {
              const userId = userIdMap.get(email);
              return userId ? { userId, role: 'MEMBER' as const } : null;
            }).filter(Boolean) as { userId: string; role: 'MEMBER' }[],
          ],
        },
      },
    });
    
    tripIdMap.set(tripData.title, trip.id);
  }
  
  console.log(`   ✅ Created ${demoTrips.length} trips`);
  return tripIdMap;
}

