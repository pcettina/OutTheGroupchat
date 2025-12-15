import { PrismaClient, ActivityCategory, ActivityStatus, PriceRange } from '@prisma/client';

export interface DemoActivity {
  tripTitle: string;
  name: string;
  description: string;
  category: ActivityCategory;
  status: ActivityStatus;
  location: {
    address: string;
    coordinates?: { lat: number; lng: number };
  };
  duration: number; // minutes
  cost: number;
  priceRange: PriceRange;
  isPublic: boolean;
}

export const demoActivities: DemoActivity[] = [
  // Nashville Bachelor Party
  {
    tripTitle: 'Nashville Bachelor Party',
    name: 'Broadway Honky-Tonk Crawl',
    description: 'Hit the legendary honky-tonks on Lower Broadway. Start at Tootsie\'s, end wherever the night takes you.',
    category: 'NIGHTLIFE',
    status: 'APPROVED',
    location: { address: 'Broadway, Nashville, TN', coordinates: { lat: 36.1622, lng: -86.7766 } },
    duration: 300,
    cost: 100,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'Nashville Bachelor Party',
    name: 'Prince\'s Hot Chicken',
    description: 'The OG Nashville hot chicken. Order "medium" unless you have something to prove.',
    category: 'FOOD',
    status: 'APPROVED',
    location: { address: '123 Ewing Dr, Nashville, TN' },
    duration: 90,
    cost: 25,
    priceRange: 'BUDGET',
    isPublic: true,
  },
  {
    tripTitle: 'Nashville Bachelor Party',
    name: 'TopGolf Nashville',
    description: 'Golf, drinks, and climate-controlled bays. Perfect for the non-golfers in the group.',
    category: 'ENTERTAINMENT',
    status: 'SUGGESTED',
    location: { address: '500 Cowan St, Nashville, TN' },
    duration: 180,
    cost: 60,
    priceRange: 'MODERATE',
    isPublic: true,
  },

  // Austin Music & BBQ
  {
    tripTitle: 'Austin Music & BBQ Crawl',
    name: 'Franklin Barbecue',
    description: 'Worth the 3-hour wait. Get there at 8am or regret it forever. Brisket is life-changing.',
    category: 'FOOD',
    status: 'APPROVED',
    location: { address: '900 E 11th St, Austin, TX', coordinates: { lat: 30.2700, lng: -97.7262 } },
    duration: 240,
    cost: 35,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'Austin Music & BBQ Crawl',
    name: 'Sixth Street Live Music',
    description: 'Bar hop through Dirty Sixth for live music. Every bar has a band, every band slaps.',
    category: 'ENTERTAINMENT',
    status: 'APPROVED',
    location: { address: '6th Street, Austin, TX' },
    duration: 300,
    cost: 75,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'Austin Music & BBQ Crawl',
    name: 'Barton Springs Pool',
    description: 'Natural spring-fed pool. 68°F year-round. Perfect hangover cure.',
    category: 'NATURE',
    status: 'SUGGESTED',
    location: { address: 'Zilker Park, Austin, TX' },
    duration: 180,
    cost: 9,
    priceRange: 'BUDGET',
    isPublic: true,
  },

  // Miami Art Basel
  {
    tripTitle: 'Miami Art Basel Weekend',
    name: 'Wynwood Walls Tour',
    description: 'Outdoor street art museum. Instagram gold. Best at golden hour.',
    category: 'CULTURE',
    status: 'APPROVED',
    location: { address: '2520 NW 2nd Ave, Miami, FL', coordinates: { lat: 25.8011, lng: -80.1994 } },
    duration: 120,
    cost: 12,
    priceRange: 'BUDGET',
    isPublic: true,
  },
  {
    tripTitle: 'Miami Art Basel Weekend',
    name: 'LIV Nightclub',
    description: 'THE Miami club experience. Get a table or prepare to wait. Dress code enforced.',
    category: 'NIGHTLIFE',
    status: 'APPROVED',
    location: { address: '4441 Collins Ave, Miami Beach, FL' },
    duration: 300,
    cost: 200,
    priceRange: 'LUXURY',
    isPublic: true,
  },
  {
    tripTitle: 'Miami Art Basel Weekend',
    name: 'South Beach Morning',
    description: 'Ocean Drive coffee, beach walk, Art Deco architecture. The chill before the storm.',
    category: 'NATURE',
    status: 'SUGGESTED',
    location: { address: 'Ocean Drive, Miami Beach, FL' },
    duration: 150,
    cost: 20,
    priceRange: 'BUDGET',
    isPublic: true,
  },

  // NOLA Jazz Fest
  {
    tripTitle: 'NOLA Jazz Fest Adventure',
    name: 'Jazz Fest Main Stage',
    description: 'The main event! Check the lineup and plan your stages. Bring sunscreen.',
    category: 'ENTERTAINMENT',
    status: 'APPROVED',
    location: { address: 'Fair Grounds Race Course, New Orleans, LA' },
    duration: 480,
    cost: 95,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'NOLA Jazz Fest Adventure',
    name: 'Frenchmen Street Late Night',
    description: 'Where locals go for live jazz. Skip Bourbon, come here. Music until 4am.',
    category: 'NIGHTLIFE',
    status: 'APPROVED',
    location: { address: 'Frenchmen Street, New Orleans, LA' },
    duration: 240,
    cost: 50,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'NOLA Jazz Fest Adventure',
    name: 'Café Du Monde Beignets',
    description: 'Powdered sugar everywhere. Open 24/7. A NOLA rite of passage.',
    category: 'FOOD',
    status: 'APPROVED',
    location: { address: '800 Decatur St, New Orleans, LA' },
    duration: 45,
    cost: 12,
    priceRange: 'BUDGET',
    isPublic: true,
  },

  // Vegas Birthday
  {
    tripTitle: 'Vegas Birthday Bash',
    name: 'Omnia Nightclub',
    description: 'Massive club at Caesars. World-class DJs. The chandelier alone is worth it.',
    category: 'NIGHTLIFE',
    status: 'APPROVED',
    location: { address: 'Caesars Palace, Las Vegas, NV' },
    duration: 300,
    cost: 150,
    priceRange: 'EXPENSIVE',
    isPublic: true,
  },
  {
    tripTitle: 'Vegas Birthday Bash',
    name: 'High Roller Observation Wheel',
    description: 'World\'s tallest observation wheel. Book the open bar cabin. Trust.',
    category: 'ENTERTAINMENT',
    status: 'APPROVED',
    location: { address: 'The LINQ Promenade, Las Vegas, NV' },
    duration: 60,
    cost: 60,
    priceRange: 'MODERATE',
    isPublic: true,
  },

  // San Diego Surf & Tacos (IN_PROGRESS)
  {
    tripTitle: 'San Diego Surf & Tacos',
    name: 'Pacific Beach Surf Lesson',
    description: 'Morning surf session with local instructors. All levels welcome!',
    category: 'SPORTS',
    status: 'COMPLETED',
    location: { address: 'Pacific Beach, San Diego, CA' },
    duration: 180,
    cost: 85,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'San Diego Surf & Tacos',
    name: 'Tacos El Gordo',
    description: 'Tijuana-style street tacos. The al pastor is legendary. Cash only.',
    category: 'FOOD',
    status: 'COMPLETED',
    location: { address: '689 H St, Chula Vista, CA' },
    duration: 60,
    cost: 15,
    priceRange: 'BUDGET',
    isPublic: true,
  },

  // Charleston Completed
  {
    tripTitle: 'Charleston Weekend Getaway',
    name: 'Husk Restaurant',
    description: 'Southern cuisine elevated. Everything sourced from the South. Reservations essential.',
    category: 'FOOD',
    status: 'COMPLETED',
    location: { address: '76 Queen St, Charleston, SC' },
    duration: 120,
    cost: 85,
    priceRange: 'EXPENSIVE',
    isPublic: true,
  },
  {
    tripTitle: 'Charleston Weekend Getaway',
    name: 'Historic District Walking Tour',
    description: 'Rainbow Row, Battery, and 400 years of history. Morning tour recommended.',
    category: 'CULTURE',
    status: 'COMPLETED',
    location: { address: 'Downtown Charleston, SC' },
    duration: 150,
    cost: 30,
    priceRange: 'BUDGET',
    isPublic: true,
  },

  // Portland Completed
  {
    tripTitle: 'Portland Brewery Tour',
    name: 'Great Notion Brewing',
    description: 'Hazys and fruit sours that\'ll change your beer life. Get the crowlers.',
    category: 'FOOD',
    status: 'COMPLETED',
    location: { address: '2204 NE Alberta St, Portland, OR' },
    duration: 90,
    cost: 30,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'Portland Brewery Tour',
    name: 'Powell\'s City of Books',
    description: 'A full city block of books. Bring a map. Lose an afternoon.',
    category: 'CULTURE',
    status: 'COMPLETED',
    location: { address: '1005 W Burnside St, Portland, OR' },
    duration: 120,
    cost: 0,
    priceRange: 'FREE',
    isPublic: true,
  },

  // Standalone popular activities (for inspiration page)
  {
    tripTitle: 'Colorado Ski Trip',
    name: 'Vail Mountain Skiing',
    description: 'World-class skiing across 5,317 acres. Back Bowls are not to be missed.',
    category: 'SPORTS',
    status: 'SUGGESTED',
    location: { address: 'Vail Mountain, Vail, CO' },
    duration: 360,
    cost: 200,
    priceRange: 'EXPENSIVE',
    isPublic: true,
  },
  {
    tripTitle: 'Colorado Ski Trip',
    name: 'Après-Ski at 10th Mountain',
    description: 'Whiskey bar with mountain views. Warm up with Colorado spirits.',
    category: 'NIGHTLIFE',
    status: 'SUGGESTED',
    location: { address: 'Vail Village, Vail, CO' },
    duration: 120,
    cost: 50,
    priceRange: 'MODERATE',
    isPublic: true,
  },
  {
    tripTitle: 'Girls Trip: Scottsdale Spa Weekend',
    name: 'Sanctuary Spa Day',
    description: 'Asian-inspired spa in the mountains. Book the Watsu treatment.',
    category: 'OTHER',
    status: 'SUGGESTED',
    location: { address: '5700 E McDonald Dr, Paradise Valley, AZ' },
    duration: 240,
    cost: 250,
    priceRange: 'LUXURY',
    isPublic: true,
  },
  {
    tripTitle: 'Girls Trip: Scottsdale Spa Weekend',
    name: 'Old Town Scottsdale Shopping',
    description: 'Boutiques, galleries, and way too many margaritas at lunch.',
    category: 'SHOPPING',
    status: 'SUGGESTED',
    location: { address: 'Old Town Scottsdale, AZ' },
    duration: 180,
    cost: 150,
    priceRange: 'MODERATE',
    isPublic: true,
  },
];

export async function seedActivities(
  prisma: PrismaClient,
  tripIdMap: Map<string, string>
): Promise<string[]> {
  console.log('🎯 Creating demo activities...');
  
  const activityIds: string[] = [];
  
  for (const activityData of demoActivities) {
    const tripId = tripIdMap.get(activityData.tripTitle);
    if (!tripId) {
      console.warn(`   ⚠️  Trip not found: ${activityData.tripTitle}`);
      continue;
    }
    
    const activity = await prisma.activity.create({
      data: {
        tripId,
        name: activityData.name,
        description: activityData.description,
        category: activityData.category,
        status: activityData.status,
        location: activityData.location,
        duration: activityData.duration,
        cost: activityData.cost,
        priceRange: activityData.priceRange,
        isPublic: activityData.isPublic,
      },
    });
    
    activityIds.push(activity.id);
  }
  
  console.log(`   ✅ Created ${demoActivities.length} activities`);
  return activityIds;
}

