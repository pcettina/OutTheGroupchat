import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// DiceBear avatar URL generator
const getAvatar = (seed: string, style: string = 'avataaars') => 
  `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

export interface DemoUser {
  email: string;
  name: string;
  password: string;
  city: string;
  bio: string;
  image: string;
  phone?: string;
  preferences: {
    travelStyle: string;
    interests: string[];
    budgetRange: { min: number; max: number; currency: string };
    pace?: string;
    accommodation?: string;
  };
}

export const demoUsers: Omit<DemoUser, 'password'>[] = [
  {
    email: 'alex@demo.com',
    name: 'Alex Johnson',
    city: 'New York, NY',
    bio: '🗽 NYC native | Adventure seeker | Always planning the next escape. Photography enthusiast who believes the best trips are unplanned detours.',
    image: getAvatar('alex-johnson', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['hiking', 'photography', 'street food', 'live music'],
      budgetRange: { min: 500, max: 1200, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'mid-range',
    },
  },
  {
    email: 'jordan@demo.com',
    name: 'Jordan Smith',
    city: 'Los Angeles, CA',
    bio: '🌴 LA vibes | Beach bum & sports fanatic | If there\'s a rooftop bar, I\'ll find it. Always down for spontaneous road trips.',
    image: getAvatar('jordan-smith', 'avataaars'),
    preferences: {
      travelStyle: 'relaxation',
      interests: ['beach', 'sports', 'nightlife', 'brunch'],
      budgetRange: { min: 700, max: 1500, currency: 'USD' },
      pace: 'relaxed',
      accommodation: 'luxury',
    },
  },
  {
    email: 'taylor@demo.com',
    name: 'Taylor Brown',
    city: 'Chicago, IL',
    bio: '🎭 Culture vulture | Museum hopper | Foodie who plans trips around restaurants. Deep dish > thin crust, fight me.',
    image: getAvatar('taylor-brown', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['museums', 'fine dining', 'theater', 'architecture'],
      budgetRange: { min: 400, max: 900, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'boutique',
    },
  },
  {
    email: 'casey@demo.com',
    name: 'Casey Wilson',
    city: 'Austin, TX',
    bio: '🎸 Keep Austin Weird | Live music addict | BBQ connoisseur | Will travel for a good taco. Tech by day, two-step by night.',
    image: getAvatar('casey-wilson', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['live music', 'BBQ', 'craft beer', 'outdoors'],
      budgetRange: { min: 300, max: 700, currency: 'USD' },
      pace: 'packed',
      accommodation: 'budget',
    },
  },
  {
    email: 'morgan@demo.com',
    name: 'Morgan Davis',
    city: 'Boston, MA',
    bio: '📚 History nerd | Craft beer enthusiast | Sports fan (Go Sox!) | Love finding hidden speakeasies and hole-in-the-wall spots.',
    image: getAvatar('morgan-davis', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['history', 'craft beer', 'sports', 'walking tours'],
      budgetRange: { min: 500, max: 1000, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'mid-range',
    },
  },
  {
    email: 'riley@demo.com',
    name: 'Riley Martinez',
    city: 'Miami, FL',
    bio: '🌊 Miami heat | Beach volleyball player | Salsa dancer | Fluent in Spanish and good vibes. Living for sunset cocktails.',
    image: getAvatar('riley-martinez', 'avataaars'),
    preferences: {
      travelStyle: 'relaxation',
      interests: ['beach', 'dancing', 'water sports', 'nightlife'],
      budgetRange: { min: 600, max: 1300, currency: 'USD' },
      pace: 'relaxed',
      accommodation: 'luxury',
    },
  },
  {
    email: 'sam@demo.com',
    name: 'Sam Thompson',
    city: 'Denver, CO',
    bio: '🏔️ Mile high life | Skier & hiker | Craft cocktail maker | Believes every trip needs at least one mountain. 14er enthusiast.',
    image: getAvatar('sam-thompson', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['skiing', 'hiking', 'craft cocktails', 'camping'],
      budgetRange: { min: 400, max: 900, currency: 'USD' },
      pace: 'packed',
      accommodation: 'airbnb',
    },
  },
  {
    email: 'jamie@demo.com',
    name: 'Jamie Lee',
    city: 'Seattle, WA',
    bio: '☕ Coffee snob | Tech worker escaping screens | PNW hiker | Rainy day reader. Looking for the perfect latte in every city.',
    image: getAvatar('jamie-lee', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['coffee', 'bookstores', 'hiking', 'indie music'],
      budgetRange: { min: 500, max: 1100, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'boutique',
    },
  },
  {
    email: 'drew@demo.com',
    name: 'Drew Parker',
    city: 'Nashville, TN',
    bio: '🎵 Music City local | Honky-tonk regular | Hot chicken expert | Will show you the real Nashville beyond Broadway.',
    image: getAvatar('drew-parker', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['country music', 'southern food', 'dive bars', 'songwriting'],
      budgetRange: { min: 300, max: 600, currency: 'USD' },
      pace: 'packed',
      accommodation: 'budget',
    },
  },
  {
    email: 'avery@demo.com',
    name: 'Avery Chen',
    city: 'San Francisco, CA',
    bio: '🌉 Bay Area native | Startup life | Wine country weekender | Dim sum expert. Always chasing the perfect view.',
    image: getAvatar('avery-chen', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['wine', 'fine dining', 'tech', 'photography'],
      budgetRange: { min: 800, max: 2000, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'luxury',
    },
  },
  {
    email: 'quinn@demo.com',
    name: 'Quinn Roberts',
    city: 'Portland, OR',
    bio: '🍺 Keep Portland Weird | Brewery hopper | Vintage shopping addict | Believes in farm-to-table everything.',
    image: getAvatar('quinn-roberts', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['craft beer', 'vintage shopping', 'farmers markets', 'food trucks'],
      budgetRange: { min: 350, max: 750, currency: 'USD' },
      pace: 'relaxed',
      accommodation: 'airbnb',
    },
  },
  {
    email: 'blake@demo.com',
    name: 'Blake Anderson',
    city: 'Phoenix, AZ',
    bio: '🌵 Desert dweller | Golf enthusiast | Pool party host | Escaping the heat one trip at a time.',
    image: getAvatar('blake-anderson', 'avataaars'),
    preferences: {
      travelStyle: 'relaxation',
      interests: ['golf', 'spas', 'poolside lounging', 'southwestern cuisine'],
      budgetRange: { min: 600, max: 1400, currency: 'USD' },
      pace: 'relaxed',
      accommodation: 'resort',
    },
  },
  {
    email: 'reese@demo.com',
    name: 'Reese Kim',
    city: 'Atlanta, GA',
    bio: '🍑 ATL raised | Hip-hop head | Soul food lover | Always finding the best brunch spots and live shows.',
    image: getAvatar('reese-kim', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['hip-hop', 'soul food', 'brunch', 'street art'],
      budgetRange: { min: 400, max: 850, currency: 'USD' },
      pace: 'packed',
      accommodation: 'mid-range',
    },
  },
  {
    email: 'skyler@demo.com',
    name: 'Skyler Patel',
    city: 'New Orleans, LA',
    bio: '⚜️ NOLA born | Jazz enthusiast | Mardi Gras veteran | Can recommend a po\'boy for any occasion. Laissez les bons temps rouler!',
    image: getAvatar('skyler-patel', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['jazz', 'cajun food', 'festivals', 'history'],
      budgetRange: { min: 350, max: 800, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'boutique',
    },
  },
  {
    email: 'cameron@demo.com',
    name: 'Cameron Wright',
    city: 'San Diego, CA',
    bio: '🏄 SoCal surfer | Taco Tuesday enthusiast | Beach volleyball player | Living that eternal summer life.',
    image: getAvatar('cameron-wright', 'avataaars'),
    preferences: {
      travelStyle: 'relaxation',
      interests: ['surfing', 'tacos', 'beach', 'craft beer'],
      budgetRange: { min: 450, max: 950, currency: 'USD' },
      pace: 'relaxed',
      accommodation: 'mid-range',
    },
  },
  {
    email: 'dakota@demo.com',
    name: 'Dakota Hernandez',
    city: 'Las Vegas, NV',
    bio: '🎰 Vegas local (yes, we exist) | Poker player | Show enthusiast | Knows all the off-strip gems.',
    image: getAvatar('dakota-hernandez', 'avataaars'),
    preferences: {
      travelStyle: 'adventure',
      interests: ['nightlife', 'shows', 'fine dining', 'day clubs'],
      budgetRange: { min: 500, max: 1500, currency: 'USD' },
      pace: 'packed',
      accommodation: 'luxury',
    },
  },
  {
    email: 'emery@demo.com',
    name: 'Emery Foster',
    city: 'Minneapolis, MN',
    bio: '❄️ Minnesota nice | Lake life lover | Brewery explorer | Prince superfan. Yes, we survive the winters.',
    image: getAvatar('emery-foster', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['lakes', 'craft beer', 'music history', 'nature'],
      budgetRange: { min: 300, max: 700, currency: 'USD' },
      pace: 'moderate',
      accommodation: 'airbnb',
    },
  },
  {
    email: 'frankie@demo.com',
    name: 'Frankie Russo',
    city: 'Philadelphia, PA',
    bio: '🔔 Philly born & raised | Cheesesteak purist | Sports fanatic | History buff. Always repping the 215.',
    image: getAvatar('frankie-russo', 'avataaars'),
    preferences: {
      travelStyle: 'cultural',
      interests: ['sports', 'history', 'street food', 'dive bars'],
      budgetRange: { min: 350, max: 800, currency: 'USD' },
      pace: 'packed',
      accommodation: 'budget',
    },
  },
];

export async function seedUsers(prisma: PrismaClient): Promise<Map<string, string>> {
  console.log('👤 Creating demo users...');
  
  const hashedPassword = await bcrypt.hash('demo123', 10);
  const userIdMap = new Map<string, string>();
  
  for (const userData of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        name: userData.name,
        city: userData.city,
        bio: userData.bio,
        image: userData.image,
        preferences: userData.preferences,
      },
      create: {
        email: userData.email,
        name: userData.name,
        password: hashedPassword,
        city: userData.city,
        bio: userData.bio,
        image: userData.image,
        preferences: userData.preferences,
      },
    });
    userIdMap.set(userData.email, user.id);
  }
  
  console.log(`   ✅ Created ${demoUsers.length} users`);
  return userIdMap;
}

