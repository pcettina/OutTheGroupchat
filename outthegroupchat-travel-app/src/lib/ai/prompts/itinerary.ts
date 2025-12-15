import { TripPreferences, SurveyAnalysis } from '@/types';

export const itinerarySystemPrompt = `You are an expert travel planner specializing in group trips. Your job is to create personalized, detailed itineraries that balance different group members' preferences while maximizing fun and minimizing conflict.

CORE GUIDELINES:
- Consider everyone's budget constraints and optimize for value
- Balance activity levels (active vs relaxed) throughout the day
- Include options for the whole group AND optional activities for subgroups
- Factor in travel time between locations (be realistic!)
- Include meal recommendations that accommodate different tastes and budgets

WEATHER AWARENESS:
- Consider typical weather for the destination and season
- Always provide indoor backup options for outdoor activities
- Schedule outdoor activities during optimal times (morning for hot climates, afternoon for cool)
- Factor in seasonal events, festivals, or closures

BUDGET OPTIMIZATION:
- Prioritize free/low-cost activities that still deliver great experiences
- Suggest money-saving tips (happy hours, combo tickets, off-peak times)
- Balance splurge moments with budget-friendly options
- Include estimated costs for everything to help planning
- Suggest where to save vs where to spend for maximum impact

GROUP DYNAMICS:
- Build in "choice time" where group can split for different interests
- Schedule group activities during high-energy times
- Include downtime to prevent burnout
- Consider different fitness levels for physical activities

Always format your response as structured JSON that can be parsed.`;

export function buildItineraryPrompt(params: {
  destination: string;
  dates: { start: string; end: string };
  groupSize: number;
  preferences: TripPreferences[];
  surveyAnalysis?: SurveyAnalysis;
  budget?: { total: number; currency: string };
}) {
  const { destination, dates, groupSize, preferences, surveyAnalysis, budget } = params;
  
  return `Create a detailed day-by-day itinerary for a group trip.

TRIP DETAILS:
- Destination: ${destination}
- Dates: ${dates.start} to ${dates.end}
- Group size: ${groupSize} people
${budget ? `- Budget: ${budget.currency} ${budget.total} total (${Math.floor(budget.total / groupSize)} per person)` : ''}

GROUP PREFERENCES:
${preferences.map((p, i) => `
Member ${i + 1}:
- Travel style: ${p.travelStyle || 'Not specified'}
- Interests: ${p.interests?.join(', ') || 'Not specified'}
- Budget range: ${p.budgetRange ? `${p.budgetRange.min}-${p.budgetRange.max} ${p.budgetRange.currency}` : 'Not specified'}
`).join('\n')}

${surveyAnalysis ? `
SURVEY ANALYSIS:
- Total responses: ${surveyAnalysis.totalResponses}
- Response rate: ${surveyAnalysis.responseRate}%
- Budget analysis: ${surveyAnalysis.budgetAnalysis?.groupOptimal ? `Group optimal: ${surveyAnalysis.budgetAnalysis.groupOptimal}` : 'Not specified'}
- Top location preferences: ${surveyAnalysis.locationPreferences?.slice(0, 3).map(l => l.location).join(', ') || 'Not specified'}
- Activity preferences: ${surveyAnalysis.activityPreferences?.slice(0, 5).map(a => a.activity).join(', ') || 'Not specified'}
` : ''}

Please create the itinerary in the following JSON format:
{
  "overview": "Brief trip summary highlighting key experiences",
  "weatherForecast": {
    "typical": "What to expect weather-wise this time of year",
    "recommendation": "How to dress and prepare"
  },
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "theme": "Day theme (e.g., 'Beach Day', 'Cultural Exploration')",
      "items": [
        {
          "time": "09:00",
          "title": "Activity name",
          "description": "What to do and why it's great",
          "location": "Address or area",
          "duration": 120,
          "cost": { "amount": 50, "per": "person", "savingTip": "Optional tip to save money" },
          "category": "food|activity|transport|leisure",
          "optional": false,
          "groupSize": "full|optional|split",
          "weatherDependent": false,
          "indoorBackup": "Alternative if weather is bad",
          "notes": "Pro tips, best times, reservations needed"
        }
      ],
      "meals": {
        "breakfast": { "name": "Restaurant", "cuisine": "Type", "priceRange": "$-$$$$", "mustTry": "Signature dish" },
        "lunch": { "name": "Restaurant", "cuisine": "Type", "priceRange": "$-$$$$", "mustTry": "Signature dish" },
        "dinner": { "name": "Restaurant", "cuisine": "Type", "priceRange": "$-$$$$", "mustTry": "Signature dish", "reservation": true }
      },
      "freeTime": "When and where the group can split up for personal exploration",
      "weatherBackup": "Full alternative day plan if weather is bad"
    }
  ],
  "budgetBreakdown": {
    "accommodation": { "perNight": 0, "total": 0, "savingTip": "How to save" },
    "food": { "perDay": 0, "total": 0, "savingTip": "How to save" },
    "activities": { "total": 0, "savingTip": "How to save" },
    "transport": { "total": 0, "savingTip": "How to save" },
    "total": { "perPerson": 0, "group": 0 },
    "splurgeWorthy": ["Experiences worth spending extra on"],
    "skipOrSave": ["Where you can cut costs without missing out"]
  },
  "packingTips": ["Tip 1", "Tip 2", "Weather-specific items"],
  "localTips": ["Insider tip 1", "Money-saving tip 2", "Safety tip 3"],
  "moneySavingHacks": ["Specific ways to save at this destination"]
}`;
}

export const itineraryRefinementPrompt = `You are refining an existing itinerary based on user feedback. 
Keep the parts they liked, adjust the parts they didn't, and maintain the overall structure.
Respond with the complete updated itinerary in the same JSON format.`;

