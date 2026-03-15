/**
 * Recommendation Data
 *
 * Static destination databases, activity lists, cost constants, and airport
 * code mappings used by the RecommendationService. Extracted to keep the
 * service file under 600 lines.
 *
 * @module recommendation-data
 */

/** Destination metadata including coordinates, timezone, and cost multipliers. */
export const DESTINATIONS: Record<string, {
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  timezone: string;
  baseCostMultiplier: number;
  airportCode: string;
}> = {
  'Nashville': {
    city: 'Nashville',
    country: 'USA',
    coordinates: { lat: 36.1627, lng: -86.7816 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 0.9,
    airportCode: 'BNA',
  },
  'NYC': {
    city: 'New York City',
    country: 'USA',
    coordinates: { lat: 40.7128, lng: -74.0060 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.4,
    airportCode: 'JFK',
  },
  'Chicago': {
    city: 'Chicago',
    country: 'USA',
    coordinates: { lat: 41.8781, lng: -87.6298 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 1.1,
    airportCode: 'ORD',
  },
  'LA': {
    city: 'Los Angeles',
    country: 'USA',
    coordinates: { lat: 34.0522, lng: -118.2437 },
    timezone: 'America/Los_Angeles',
    baseCostMultiplier: 1.3,
    airportCode: 'LAX',
  },
  'Austin': {
    city: 'Austin',
    country: 'USA',
    coordinates: { lat: 30.2672, lng: -97.7431 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 1.0,
    airportCode: 'AUS',
  },
  'Boston': {
    city: 'Boston',
    country: 'USA',
    coordinates: { lat: 42.3601, lng: -71.0589 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.2,
    airportCode: 'BOS',
  },
  'Charleston': {
    city: 'Charleston',
    country: 'USA',
    coordinates: { lat: 32.7765, lng: -79.9311 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.0,
    airportCode: 'CHS',
  },
};

/** Destination-specific curated activity lists by category. */
export const DESTINATION_ACTIVITIES: Record<string, {
  sports: string[];
  outdoor: string[];
  beach: string[];
  nightlife: string[];
  food: string[];
  culture: string[];
}> = {
  'Nashville': {
    sports: ['Sounds Baseball Game', 'Titans Game', 'Predators Game'],
    outdoor: ['Cumberland River Kayaking', 'Centennial Park', 'Golf at Hermitage'],
    beach: ['Percy Priest Lake', 'Pool Day'],
    nightlife: ['Broadway Bar Crawl', 'Printers Alley', 'The Gulch Bars'],
    food: ['Hot Chicken Tour', 'BBQ Trail', 'Biscuit Love Brunch'],
    culture: ['Country Music Hall of Fame', 'Grand Ole Opry', 'Ryman Auditorium'],
  },
  'NYC': {
    sports: ['Yankees Game', 'Mets Game', 'Knicks Game'],
    outdoor: ['Central Park', 'High Line Walk', 'Brooklyn Bridge Walk'],
    beach: ['Coney Island', 'Rockaway Beach'],
    nightlife: ['Greenwich Village', 'Rooftop Bars', 'Brooklyn Brewery'],
    food: ['Pizza Tour', 'Chinatown', 'Little Italy'],
    culture: ['MET Museum', 'Broadway Show', 'Statue of Liberty'],
  },
  'Chicago': {
    sports: ['Cubs at Wrigley', 'White Sox Game', 'Bulls Game'],
    outdoor: ['Lakefront Trail', 'Millennium Park', 'Lincoln Park'],
    beach: ['North Avenue Beach', 'Oak Street Beach'],
    nightlife: ['River North', 'Wicker Park', 'Blues Club'],
    food: ['Deep Dish Pizza Tour', 'Chicago Hot Dogs', 'Steakhouse Dinner'],
    culture: ['Art Institute', 'Architecture Tour', 'Field Museum'],
  },
  'LA': {
    sports: ['Dodgers Game', 'Lakers Game', 'Clippers Game'],
    outdoor: ['Griffith Park Hike', 'Hollywood Hills', 'Venice Boardwalk'],
    beach: ['Santa Monica', 'Venice Beach', 'Malibu'],
    nightlife: ['Hollywood Clubs', 'Downtown LA', 'Craft Brewery Tour'],
    food: ['Taco Tour', 'Korean BBQ', 'Celebrity Chef Restaurant'],
    culture: ['Getty Museum', 'Hollywood Walk of Fame', 'Universal Studios'],
  },
  'Austin': {
    sports: ['UT Game', 'Round Rock Express', 'Austin FC'],
    outdoor: ['Barton Springs', 'Lady Bird Lake', 'Zilker Park'],
    beach: ['Lake Travis', 'Barton Creek Greenbelt'],
    nightlife: ['Sixth Street', 'Rainey Street', 'Live Music Venues'],
    food: ['BBQ Trail', 'Taco Crawl', 'Food Truck Park'],
    culture: ['State Capitol', 'LBJ Library', 'South Congress'],
  },
  'Boston': {
    sports: ['Red Sox at Fenway', 'Celtics Game', 'Bruins Game'],
    outdoor: ['Freedom Trail', 'Boston Common', 'Harbor Islands'],
    beach: ['Carson Beach', 'Revere Beach'],
    nightlife: ['Faneuil Hall', 'Fenway Bars', 'Seaport District'],
    food: ['Seafood Tour', 'Italian in North End', 'Oyster Bar'],
    culture: ['Freedom Trail', 'Harvard Tour', 'Museum of Fine Arts'],
  },
  'Charleston': {
    sports: ['RiverDogs Game', 'College of Charleston'],
    outdoor: ['Historic Walking Tour', 'Shem Creek', 'Angel Oak Tree'],
    beach: ['Folly Beach', 'Sullivans Island', 'Isle of Palms'],
    nightlife: ['King Street', 'Upper King', 'Cocktail Club'],
    food: ['Lowcountry Cuisine', 'Shrimp & Grits Tour', 'Oyster Roast'],
    culture: ['Historic District', 'Fort Sumter', 'Plantation Tours'],
  },
};

/** Base per-person daily cost estimates (USD). Applied with destination multiplier. */
export const BASE_DAILY_COSTS = {
  /** Per person, shared accommodation */
  accommodation: 75,
  food: 60,
  activities: 40,
  transport: 25,
};

/** Lookup table: city name → IATA airport code (lowercase keys). */
export const AIRPORT_CODES: Record<string, string> = {
  'new york': 'JFK',
  'newark': 'EWR',
  'los angeles': 'LAX',
  'chicago': 'ORD',
  'houston': 'IAH',
  'phoenix': 'PHX',
  'philadelphia': 'PHL',
  'san antonio': 'SAT',
  'san diego': 'SAN',
  'dallas': 'DFW',
  'austin': 'AUS',
  'nashville': 'BNA',
  'boston': 'BOS',
  'charleston': 'CHS',
  'atlanta': 'ATL',
  'denver': 'DEN',
  'seattle': 'SEA',
  'miami': 'MIA',
  'orlando': 'MCO',
};

/**
 * Rough distance-based flight cost multipliers per origin airport code.
 * Used when a real Amadeus API is not available.
 */
export const FLIGHT_DISTANCE_FACTORS: Record<string, number> = {
  'JFK': 1.2, 'EWR': 1.2, 'LAX': 1.5, 'ORD': 1.0,
  'ATL': 0.9, 'DFW': 1.0, 'DEN': 1.1, 'SEA': 1.4,
  'MIA': 1.1, 'BOS': 1.1, 'PHX': 1.2, 'IAH': 1.0,
};
