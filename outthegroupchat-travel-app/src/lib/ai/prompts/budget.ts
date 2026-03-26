/**
 * System prompt establishing the AI's role as a travel budget expert.
 * Instructs the model to produce structured JSON budget advice for groups.
 */
export const budgetOptimizationSystemPrompt = `You are a travel budget expert who helps groups maximize their experience while staying within budget. You know how to find deals, identify where to splurge vs save, and create realistic cost estimates.

Guidelines:
- Be realistic about costs in different destinations
- Suggest money-saving tips without sacrificing experience
- Consider group sizes for bulk discounts
- Account for local tipping customs and hidden costs
- Provide alternatives at different price points

Always respond in structured JSON format.`;

/**
 * Builds a detailed budget-analysis prompt for an AI model.
 *
 * @param params - Trip parameters used to populate the prompt.
 * @param params.destination - City or region the group is visiting.
 * @param params.duration - Length of the trip in days.
 * @param params.groupSize - Number of travelers in the group.
 * @param params.targetBudget - Total trip budget across the whole group.
 * @param params.currency - ISO currency code (e.g., "USD").
 * @param params.activities - List of planned activity names.
 * @param params.accommodationStyle - Desired accommodation tier.
 * @returns A prompt string ready to send to the AI model.
 */
export function buildBudgetAnalysisPrompt(params: {
  destination: string;
  duration: number;
  groupSize: number;
  targetBudget: number;
  currency: string;
  activities: string[];
  accommodationStyle: 'budget' | 'mid-range' | 'luxury';
}) {
  const { destination, duration, groupSize, targetBudget, currency, activities, accommodationStyle } = params;
  
  return `Create a detailed budget breakdown for this trip:

TRIP DETAILS:
- Destination: ${destination}
- Duration: ${duration} days
- Group size: ${groupSize} people
- Target budget: ${currency} ${targetBudget} total
- Per person budget: ${currency} ${Math.floor(targetBudget / groupSize)}
- Accommodation style: ${accommodationStyle}
- Planned activities: ${activities.join(', ')}

Provide a comprehensive budget analysis in this format:
{
  "feasibility": {
    "isRealistic": true,
    "confidence": 85,
    "adjustmentNeeded": 0,
    "notes": "Assessment explanation"
  },
  "breakdown": {
    "accommodation": {
      "perNight": 150,
      "total": 600,
      "notes": "Recommendation",
      "options": [
        { "name": "Budget option", "cost": 80 },
        { "name": "Mid-range option", "cost": 150 },
        { "name": "Luxury option", "cost": 300 }
      ]
    },
    "food": {
      "perDayPerPerson": 50,
      "total": 800,
      "breakdown": {
        "breakfast": 10,
        "lunch": 15,
        "dinner": 25
      }
    },
    "activities": {
      "total": 400,
      "items": [
        { "activity": "Name", "cost": 50, "priority": "must-do" }
      ]
    },
    "transport": {
      "flights": 400,
      "local": 100,
      "total": 500
    },
    "miscellaneous": {
      "tips": 50,
      "souvenirs": 50,
      "emergency": 100,
      "total": 200
    }
  },
  "totalEstimate": 2500,
  "perPerson": 625,
  "savingTips": [
    "Tip 1",
    "Tip 2"
  ],
  "splurgeRecommendations": [
    "Where to spend extra if budget allows"
  ]
}`;
}

/**
 * Short follow-up prompt for comparing activity costs and identifying best-value options.
 */
export const costComparisonPrompt = `Compare the cost of activities and suggest the best value options.
Consider quality, location, timing, and group dynamics.
Identify which splurges are worth it and where to save.`;

