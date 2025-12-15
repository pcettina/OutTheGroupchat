export const activityRecommendationSystemPrompt = `You are a local expert who knows the best activities, restaurants, and hidden gems in cities around the world. You provide personalized recommendations based on group preferences and budget.

Guidelines:
- Mix popular attractions with lesser-known spots
- Consider group dynamics and varying interests
- Include practical info: hours, booking requirements, best times to visit
- Suggest activities that work for the group size
- Be specific with names, addresses, and price ranges

Always format your response as structured JSON.`;

export function buildActivityPrompt(params: {
  destination: string;
  categories: string[];
  preferences: string[];
  budget: 'budget' | 'moderate' | 'luxury';
  groupSize: number;
  tripDates?: { start: string; end: string };
}) {
  const { destination, categories, preferences, budget, groupSize, tripDates } = params;
  
  return `Recommend activities and experiences in ${destination}.

REQUIREMENTS:
- Categories wanted: ${categories.join(', ')}
- Group interests: ${preferences.join(', ')}
- Budget level: ${budget}
- Group size: ${groupSize} people
${tripDates ? `- Visiting: ${tripDates.start} to ${tripDates.end}` : ''}

Please provide 10 recommendations in this JSON format:
{
  "recommendations": [
    {
      "name": "Activity name",
      "category": "food|entertainment|outdoors|culture|nightlife|sports",
      "description": "What makes this special",
      "address": "Full address",
      "priceRange": "$/$$/$$$",
      "estimatedCost": { "amount": 50, "per": "person" },
      "duration": 120,
      "bestTime": "When to visit",
      "bookingRequired": true,
      "groupFriendly": true,
      "goodFor": ["couples", "groups", "families"],
      "tips": "Insider advice"
    }
  ],
  "localEvents": [
    {
      "name": "Event name",
      "date": "When",
      "description": "What it is",
      "relevance": "Why this group might like it"
    }
  ]
}`;
}

export const destinationMatchingPrompt = `You are helping a group find the perfect destination for their trip based on their collective preferences, budget, and availability.

Analyze their requirements and suggest 5 destinations that would work well, explaining why each is a good match.

Response format:
{
  "destinations": [
    {
      "city": "City name",
      "country": "Country",
      "matchScore": 95,
      "whyItWorks": "Explanation",
      "bestFor": ["interest1", "interest2"],
      "estimatedBudget": { "min": 500, "max": 800, "currency": "USD" },
      "bestTimeToVisit": "Seasonal advice",
      "potentialConcerns": ["Any drawbacks"]
    }
  ]
}`;

export function buildDestinationPrompt(params: {
  preferences: {
    activities: string[];
    climate: string;
    pace: string;
  }[];
  budget: { min: number; max: number; currency: string };
  dates: { start: string; end: string };
  departureCity: string;
  restrictions?: string[];
}) {
  const { preferences, budget, dates, departureCity, restrictions } = params;
  
  const allActivities = Array.from(new Set(preferences.flatMap(p => p.activities)));
  const climatePrefs = Array.from(new Set(preferences.map(p => p.climate)));
  const pacePrefs = Array.from(new Set(preferences.map(p => p.pace)));
  
  return `Find the best destinations for this group trip:

GROUP PREFERENCES:
- Activities wanted: ${allActivities.join(', ')}
- Climate preferences: ${climatePrefs.join(', ')}
- Trip pace: ${pacePrefs.join(', ')}

CONSTRAINTS:
- Budget per person: ${budget.currency} ${budget.min}-${budget.max}
- Travel dates: ${dates.start} to ${dates.end}
- Departing from: ${departureCity}
${restrictions?.length ? `- Restrictions: ${restrictions.join(', ')}` : ''}

Consider flight costs, weather during travel dates, and how well each destination matches the group's interests. Prioritize destinations that satisfy the most group members.`;
}

