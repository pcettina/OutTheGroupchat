require('dotenv').config();

// Verify API keys are loaded
if (!process.env.TICKETMASTER_API_KEY || 
    !process.env.GOOGLE_PLACES_API_KEY || 
    !process.env.EVENTBRITE_PRIVATE_TOKEN) {
    console.error('Missing required API keys in .env file');
    process.exit(1);
}

const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const NodeCache = require('node-cache');

const priceCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

/**
 * Simple mapping of major cities to their primary airport codes
 */
const AIRPORT_CODES = {
  'new york': 'JFK',
  'newark': 'EWR',  // Added Newark Liberty International
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
  // Add more as needed
};

/**
 * Parse survey data from CSV
 * @param {string} filePath Path to the CSV file
 * @returns {Promise<Array>} Parsed survey responses
 */
function parseSurveyData(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log(`Successfully parsed ${results.length} survey responses`);
        resolve(results);
      })
      .on('error', (error) => reject(error));
  });
}

/**
 * Analyze budget preferences and constraints
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Budget analysis
 */
function analyzeBudgets(surveyData) {
  // Extract budget ranges
  const budgetRanges = {
    '$300-$500': { min: 300, max: 500, count: 0 },
    '$500-$700': { min: 500, max: 700, count: 0 },
    '$700+': { min: 700, max: 1000, count: 0 } // Using $1000 as a default upper limit
  };
  
  // Track individual budget preferences
  const individualBudgets = {};
  
  surveyData.forEach(response => {
    const name = response.Name;
    const budgetPreference = response['Budget Range for trip (excluding flights)'];
    
    // Count budget ranges
    if (budgetRanges[budgetPreference]) {
      budgetRanges[budgetPreference].count++;
    }
    
    // Store individual budget preference
    individualBudgets[name] = {
      range: budgetPreference,
      min: budgetRanges[budgetPreference]?.min || 300,
      max: budgetRanges[budgetPreference]?.max || 1000,
      travelingFrom: response['Where would you be flying out of? (Helps me put individual budgets together)']
    };
  });
  
  // Calculate optimal group budget
  const totalRespondents = surveyData.length;
  const weightedAvgMin = Object.values(budgetRanges).reduce(
    (sum, range) => sum + (range.min * range.count / totalRespondents), 0
  );
  const weightedAvgMax = Object.values(budgetRanges).reduce(
    (sum, range) => sum + (range.max * range.count / totalRespondents), 0
  );
  
  return {
    budgetRanges,
    individualBudgets,
    groupBudget: {
      optimal: Math.round((weightedAvgMin + weightedAvgMax) / 2),
      min: Math.round(weightedAvgMin),
      max: Math.round(weightedAvgMax)
    }
  };
}

/**
 * Analyze availability and date preferences
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Date analysis
 */
function analyzeDatePreferences(surveyData) {
  // Initialize availability counter
  const availability = {};
  
  // Process each survey response
  surveyData.forEach(response => {
    const name = response.Name;
    // Check if Availability exists and is not empty
    if (response.Availability && typeof response.Availability === 'string') {
      const availableDates = response.Availability.split(',').map(d => d.trim());
      
      availableDates.forEach(date => {
        if (!availability[date]) {
          availability[date] = {
            count: 0,
            people: []
          };
        }
        
        availability[date].count++;
        availability[date].people.push(name);
      });
    }
  });
  
  // Sort date ranges by popularity
  const sortedDateRanges = Object.entries(availability)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([range, data]) => ({
      dateRange: range,
      attendees: data.count,
      people: data.people
    }));
  
  // Get optimal date range (most popular)
  const optimalDateRange = sortedDateRanges.length > 0 ? sortedDateRanges[0].dateRange : 'Early July (1-15)';
  
  // Analyze trip duration preferences
  const durationPreferences = {
    '2 Days': { count: 0, rank1: 0, rank2: 0, rank3: 0 },
    '3-4 Days': { count: 0, rank1: 0, rank2: 0, rank3: 0 },
    '5-7 Days': { count: 0, rank1: 0, rank2: 0, rank3: 0 }
  };
  
  // Process duration preferences
  surveyData.forEach(response => {
    const twoDay = parseInt(response['Ideal Trip Duration (Rank 1-3 most to least preferred) [2 Days (Just a weekend)]']);
    const threeFourDay = parseInt(response['Ideal Trip Duration (Rank 1-3 most to least preferred) [3-4 Days (Long weekend)]']);
    const fiveSevenDay = parseInt(response['Ideal Trip Duration (Rank 1-3 most to least preferred) [5-7 Days]']);
    
    if (!isNaN(twoDay)) {
      durationPreferences['2 Days'].count++;
      durationPreferences['2 Days'][`rank${twoDay}`]++;
    }
    if (!isNaN(threeFourDay)) {
      durationPreferences['3-4 Days'].count++;
      durationPreferences['3-4 Days'][`rank${threeFourDay}`]++;
    }
    if (!isNaN(fiveSevenDay)) {
      durationPreferences['5-7 Days'].count++;
      durationPreferences['5-7 Days'][`rank${fiveSevenDay}`]++;
    }
  });
  
  // Calculate weighted scores for duration preferences
  const durationScores = Object.entries(durationPreferences).map(([duration, data]) => ({
    duration,
    score: (data.rank1 * 3 + data.rank2 * 2 + data.rank3 * 1) / (data.count || 1)
  }));
  
  // Sort durations by score
  durationScores.sort((a, b) => b.score - a.score);
  
  return {
    availabilityRanked: sortedDateRanges,
    optimalDateRange,
    optimalAttendance: sortedDateRanges[0]?.attendees || 0,
    durationPreferences,
    durationScores,
    optimalDuration: durationScores[0]?.duration || '3-4 Days'
  };
}

/**
 * Analyze location preferences
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Location preference analysis
 */
function analyzeLocationPreferences(surveyData) {
  // Define locations from survey
  const locations = [
    'Nashville (again)', 'NYC', 'Chicago', 'LA', 
    'Austin', 'Boston', 'Charleston'
  ];
  
  // Initialize scoring
  const locationScores = {};
  locations.forEach(location => {
    locationScores[location] = { 
      totalScore: 0,
      rankings: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0},
      avgRanking: 0,
      weightedScore: 0
    };
  });
  
  // Process rankings (1-7 scale, where 1 is highest interest)
  surveyData.forEach(response => {
    locations.forEach(location => {
      const columnName = `Location Preference (Rank 1 highest interest to 7 lowest interest) [${location}]`;
      const ranking = parseInt(response[columnName]);
      
      if (!isNaN(ranking)) {
        // Store the ranking
        locationScores[location].rankings[ranking]++;
        
        // Calculate weighted score (invert ranking so 1=7 points, 7=1 point)
        locationScores[location].weightedScore += (8 - ranking);
      }
    });
  });
  
  // Calculate average rankings and total scores
  const totalRespondents = surveyData.length;
  
  locations.forEach(location => {
    let totalRankings = 0;
    let rankingSum = 0;
    
    Object.entries(locationScores[location].rankings).forEach(([rank, count]) => {
      totalRankings += count;
      rankingSum += (parseInt(rank) * count);
    });
    
    if (totalRankings > 0) {
      locationScores[location].avgRanking = rankingSum / totalRankings;
    }
  });
  
  // Sort locations by weighted score (higher is better)
  const rankedLocations = Object.entries(locationScores)
    .sort((a, b) => b[1].weightedScore - a[1].weightedScore)
    .map(([location, data]) => ({
      location,
      weightedScore: data.weightedScore,
      avgRanking: Math.round(data.avgRanking * 10) / 10,
      topChoiceCount: data.rankings[1]
    }));
  
  // Check for other location suggestions
  const otherLocations = [];
  surveyData.forEach(response => {
    const suggestions = response['If have other location suggestions put here separated by comma (Could be for current or future trip)'];
    if (suggestions && suggestions.trim()) {
      suggestions.split(',').forEach(loc => {
        const location = loc.trim();
        if (location) {
          otherLocations.push(location);
        }
      });
    }
  });
  
  return {
    rankedLocations,
    topLocation: rankedLocations[0]?.location || 'No clear preference',
    secondLocation: rankedLocations[1]?.location || 'No clear second preference',
    thirdLocation: rankedLocations[2]?.location || 'No clear third preference',
    otherSuggestions: otherLocations
  };
}

/**
 * Analyze activity preferences
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Activity preference analysis
 */
function analyzeActivityPreferences(surveyData) {
  // Define activities from survey
  const activities = [
    'Golf', 'Concert', 'Sporting Event', 'Beach Stuff', 
    'Outdoor activities', 'Casino', 'BOOZE/Bars'
  ];
  
  // Initialize scoring
  const activityScores = {};
  activities.forEach(activity => {
    activityScores[activity] = { 
      totalScore: 0,
      rankings: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0},
      avgRanking: 0,
      weightedScore: 0
    };
  });
  
  // Process rankings (1-7 scale, where 1 is highest interest)
  surveyData.forEach(response => {
    activities.forEach(activity => {
      const columnName = `Activity Preferences during Trip (Same ranking direction) [${activity}]`;
      const ranking = parseInt(response[columnName]);
      
      if (!isNaN(ranking)) {
        // Store the ranking
        activityScores[activity].rankings[ranking]++;
        
        // Calculate weighted score (invert ranking so 1=7 points, 7=1 point)
        activityScores[activity].weightedScore += (8 - ranking);
      }
    });
    
    // Check for additional activities
    const otherActivities = response['Any other activities you would like included (current or future)'];
    if (otherActivities && otherActivities.trim() !== '' && otherActivities.toLowerCase() !== 'n/a') {
      // Store these separately
      if (!activityScores['Other']) {
        activityScores['Other'] = { suggestions: [] };
      }
      activityScores['Other'].suggestions.push({
        person: response.Name,
        suggestion: otherActivities
      });
    }
  });
  
  // Sort activities by weighted score
  const rankedActivities = Object.entries(activityScores)
    .filter(([name]) => name !== 'Other')
    .sort((a, b) => b[1].weightedScore - a[1].weightedScore)
    .map(([activity, data]) => ({
      activity,
      weightedScore: data.weightedScore,
      rankings: data.rankings
    }));
  
  // Extract top activities
  const topActivities = rankedActivities.map(item => item.activity);
  
  return {
    rankedActivities,
    topActivities,
    otherSuggestions: activityScores['Other']?.suggestions || []
  };
}

/**
 * Analyze accommodation preferences
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Accommodation preference analysis
 */
function analyzeAccommodationPreferences(surveyData) {
  // Initialize counters
  const accommodationTypes = {
    'Cool (more expensive) Shared House (airbnb)': 0,
    'Cheapest Shared house (airbnb)': 0,
    'depends on trip activity': 0
  };
  
  const roomPreferences = {
    'Private room': 0,
    '2 people to a room': 0,
    'Don\'t care': 0
  };
  
  const eventStructure = {
    'Structure': 0,
    'Planned ideas, but nothing put in reservations': 0
  };
  
  // Count preferences
  surveyData.forEach(response => {
    const accommodationType = response['What type of accommodations would you want to have?'];
    const roomPref = response['Room Sharing Preference'];
    const eventPref = response['What would you rather more free time or planned events on this (or future) trips?'];
    
    if (accommodationType && accommodationTypes[accommodationType] !== undefined) {
      accommodationTypes[accommodationType]++;
    }
    
    if (roomPref && roomPreferences[roomPref] !== undefined) {
      roomPreferences[roomPref]++;
    }
    
    if (eventPref && eventStructure[eventPref] !== undefined) {
      eventStructure[eventPref]++;
    }
  });
  
  // Rank accommodation types
  const rankedAccommodationTypes = Object.entries(accommodationTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / surveyData.length) * 100)
    }));
  
  // Rank room preferences
  const rankedRoomPreferences = Object.entries(roomPreferences)
    .sort((a, b) => b[1] - a[1])
    .map(([pref, count]) => ({
      preference: pref,
      count,
      percentage: Math.round((count / surveyData.length) * 100)
    }));
  
  // Determine structure preference
  const rankedEventStructure = Object.entries(eventStructure)
    .sort((a, b) => b[1] - a[1])
    .map(([structure, count]) => ({
      structure,
      count,
      percentage: Math.round((count / surveyData.length) * 100)
    }));
  
  return {
    accommodationTypes: rankedAccommodationTypes,
    topChoice: rankedAccommodationTypes[0]?.type || 'Cool (more expensive) Shared House (airbnb)',
    roomPreferences: rankedRoomPreferences,
    topRoomChoice: rankedRoomPreferences[0]?.preference || '2 people to a room',
    eventStructure: rankedEventStructure,
    preferredStructure: rankedEventStructure[0]?.structure || 'Structure'
  };
}

/**
 * Analyze dining preferences
 * @param {Array} surveyData Parsed survey data
 * @returns {Object} Dining preference analysis
 */
function analyzeDiningPreferences(surveyData) {
  // Track dining preferences
  const diningOptions = {
    'High-end meal (1 time as whole group)': 0,
    'Sports Bars & casual (as whole group)': 0,
    'Group catered BBQ or similar type meal': 0,
    'Group Cooking Session (Buy a bunch of steaks and chef with fellas)': 0
  };
  
  // Process dining preferences
  surveyData.forEach(response => {
    const diningPrefs = response['Dining Experiences (select all that apply)'];
    if (diningPrefs) {
      const preferences = diningPrefs.split(',').map(pref => pref.trim());
      
      preferences.forEach(pref => {
        if (diningOptions[pref] !== undefined) {
          diningOptions[pref]++;
        }
      });
    }
  });
  
  // Rank dining preferences
  const rankedDiningOptions = Object.entries(diningOptions)
    .sort((a, b) => b[1] - a[1])
    .map(([option, count]) => ({
      option,
      count,
      percentage: Math.round((count / surveyData.length) * 100)
    }));
  
  // Extract preferred options
  const preferredOptions = rankedDiningOptions
    .filter(option => option.count > 0)
    .map(option => option.option);
  
  return {
    rankedPreferences: rankedDiningOptions,
    preferences: preferredOptions,
    topDiningChoice: rankedDiningOptions[0]?.option || 'Sports Bars & casual (as whole group)'
  };
}

/**
 * Generate trip recommendations based on survey analysis
 * @param {Object} analysis Survey data analysis
 * @returns {Object} Trip recommendations
 */
function generateTripRecommendations(analysis) {
  // Get optimal date range and duration
  const dateRange = analysis.dates.optimalDateRange;
  const duration = analysis.dates.optimalDuration;
  
  // Convert date range to actual dates
  const tripDates = convertDateRangeToActualDates(dateRange, duration);
  
  // Get top location and backup options
  const primaryDestination = analysis.locations.topLocation;
  const backupDestinations = [
    analysis.locations.secondLocation,
    analysis.locations.thirdLocation
  ];
  
  // Get top activities
  const primaryActivities = analysis.activities.topActivities;
  
  // Get accommodation preferences
  const accommodationType = analysis.accommodations.preferredAccommodationType;
  const roomSharing = analysis.accommodations.preferredRoomSharing;
  
  // Calculate estimated budget based on destination and preferences
  const estimatedCosts = calculateTripBudget(
    primaryDestination,
    tripDates,
    primaryActivities,
    analysis.budget.groupBudget.optimal
  );
  
  // Generate itinerary framework
  const itinerary = generateItinerary(
    primaryDestination,
    tripDates,
    primaryActivities,
    analysis.dining.topDiningPreferences
  );
  
  // Individual travel plans
  const individualPlans = generateIndividualPlans(
    analysis.budget.individualBudgets,
    primaryDestination,
    tripDates
  );
  
  return {
    tripSummary: {
      destination: primaryDestination,
      backupOptions: backupDestinations,
      dates: tripDates,
      duration: duration,
      estimatedGroupCost: estimatedCosts.totalEstimatedCost,
      costBreakdown: estimatedCosts,
      accommodation: {
        type: accommodationType,
        roomSharing: roomSharing
      },
      primaryActivities: primaryActivities,
      attendanceRate: analysis.dates.optimalAttendance + '/' + Object.keys(analysis.budget.individualBudgets).length
    },
    itinerary: itinerary,
    individualPlans: individualPlans
  };
}

/**
 * Convert date range string to actual dates
 * @param {string} dateRange Date range string (e.g., "Early July (1-15)")
 * @param {string} duration Trip duration (e.g., "3-4 Days")
 * @returns {Object} Start and end dates
 */
function convertDateRangeToActualDates(dateRange, duration) {
  // Map date ranges to actual date spans
  const dateRangeMap = {
    'Late June (16-30)': { start: '2025-06-16', end: '2025-06-30' },
    'Early July (1-15)': { start: '2025-07-01', end: '2025-07-15' },
    'Late July (16-31)': { start: '2025-07-16', end: '2025-07-31' },
    'Early August (1-15)': { start: '2025-08-01', end: '2025-08-15' }
  };
  
  // Map duration preferences to number of days
  const durationDays = {
    '2 Days': 2,
    '3-4 Days': 4,
    '5-7 Days': 6
  };
  
  // Get date range or use default
  const range = dateRangeMap[dateRange] || { start: '2025-07-01', end: '2025-07-15' };
  const days = durationDays[duration] || 4;
  
  // Choose a start date in the middle of the range
  const rangeStart = new Date(range.start);
  const rangeEnd = new Date(range.end);
  const rangeDays = Math.round((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000));
  
  // If duration is longer than available days, start at beginning
  const offsetDays = days > rangeDays ? 0 : Math.floor((rangeDays - days) / 2);
  
  const startDate = new Date(rangeStart);
  startDate.setDate(rangeStart.getDate() + offsetDays);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + days - 1);
  
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    durationDays: days,
    dateRange: dateRange
  };
}

/**
 * Format date as MM/DD/YYYY
 * @param {Date} date Date to format
 * @returns {string} Formatted date
 */
function formatDate(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

/**
 * Calculate estimated trip costs
 * @param {string} destination Trip destination
 * @param {string} duration Trip duration
 * @param {string} accommodationType Type of accommodation
 * @param {number} optimalBudget Optimal budget per person
 * @returns {Object} Cost breakdown
 */
async function calculateTripBudget(destination, durationData, accommodationType, optimalBudget) {
  try {
    // Get real-world prices
    const [accommodationPrices, eventPrices, localPrices] = await Promise.all([
      getAccommodationPrices(destination, durationData, surveyData.length),
      getEventRecommendations(destination, durationData),
      getLocalPrices(destination)
    ]);

    // Calculate accommodation costs
    const accommodationCost = accommodationPrices ? 
      accommodationPrices.averageNightlyRate * durationData.durationDays :
      calculateDefaultAccommodationCost(destination, accommodationType);

    // Calculate food and drink costs
    const foodCost = localPrices ? 
      (localPrices.restaurants.averageMeal * 2 + localPrices.bars.averageDrink * 3) * durationData.durationDays :
      calculateDefaultFoodCost(destination);

    // Calculate activity costs
    const activityCost = eventPrices ?
      calculateEventCosts(eventPrices) :
      calculateDefaultActivityCost(destination);

    // Calculate local transport costs
    const transportCost = localPrices ?
      localPrices.transport.averageDaily * durationData.durationDays :
      calculateDefaultTransportCost(destination);

    const totalCost = accommodationCost + foodCost + activityCost + transportCost;

    return {
      perPersonPerDay: Math.round(totalCost / durationData.durationDays),
      accommodation: Math.round(accommodationCost),
      food: Math.round(foodCost),
      activities: Math.round(activityCost),
      localTransport: Math.round(transportCost),
      totalEstimatedCost: Math.round(totalCost),
      priceDetails: {
        accommodation: accommodationPrices,
        events: eventPrices,
        local: localPrices
      }
    };
  } catch (error) {
    console.error('Error calculating real-world budget:', error);
    // Fallback to original calculation method
    return calculateDefaultBudget(destination, durationData, accommodationType, optimalBudget);
  }
}

/**
 * Generate a trip itinerary
 * @param {string} destination Trip destination
 * @param {Object} dates Trip dates
 * @param {Array} topActivities Preferred activities
 * @param {Array} diningPrefs Dining preferences
 * @returns {Array} Day-by-day itinerary
 */
function generateItinerary(destination, dates, topActivities, diningPrefs) {
  const destinationActivities = getDestinationActivities(destination);
  const itinerary = [];
  const startDate = new Date(dates.startDate);
  
  for (let day = 1; day <= dates.durationDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day - 1);
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()];
    
    // Create day schedule
    const daySchedule = {
      day,
      date: `${currentDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`,
      dayOfWeek,
      activities: []
    };
    
    // Morning activity
    let morningActivity;
    if (day === 1) {
      morningActivity = "Arrival and Check-in";
    } else if (topActivities.includes('Golf') && (day === 2 || day === dates.durationDays - 1)) {
      morningActivity = "Group Golf Outing";
    } else if (topActivities.includes('Outdoor activities')) {
      morningActivity = destinationActivities.outdoor[Math.floor(Math.random() * destinationActivities.outdoor.length)];
    } else {
      morningActivity = "Free time / Optional exploring";
    }
    
    // Afternoon activity
    let afternoonActivity;
    if (day === 1) {
      afternoonActivity = "Group Welcome Gathering";
    } else if (topActivities.includes('Sporting Event') && (day === 2 || day === 3)) {
      afternoonActivity = destinationActivities.sports[Math.floor(Math.random() * destinationActivities.sports.length)];
    } else if (topActivities.includes('Beach Stuff') && day !== dates.durationDays) {
      afternoonActivity = destinationActivities.beach[Math.floor(Math.random() * destinationActivities.beach.length)];
    } else {
      afternoonActivity = "Local Sightseeing / Group Activity";
    }
    
    // Evening activity
    let eveningActivity;
    if (day === 1) {
      eveningActivity = "Group Welcome Dinner";
    } else if (day === dates.durationDays) {
      eveningActivity = "Final Group Dinner and Farewell";
    } else if (topActivities.includes('BOOZE/Bars')) {
      eveningActivity = destinationActivities.nightlife[Math.floor(Math.random() * destinationActivities.nightlife.length)];
    } else if (topActivities.includes('Casino') && day === 3) {
      eveningActivity = "Casino Night";
    } else if (topActivities.includes('Concert') && day === 2) {
      eveningActivity = "Live Music / Concert";
    } else {
      eveningActivity = "Group Dinner and Social Time";
    }
    
    // Add activities to schedule
    daySchedule.activities = [
      { time: '9:00 AM - 12:00 PM', activity: morningActivity },
      { time: '12:00 PM - 1:30 PM', activity: 'Lunch' },
      { time: '2:00 PM - 6:00 PM', activity: afternoonActivity },
      { time: '7:00 PM - Late', activity: eveningActivity }
    ];
    
    itinerary.push(daySchedule);
  }
  
  return itinerary;
}

/**
 * Get destination-specific activities
 * @param {string} destination Trip destination
 * @returns {Object} Destination activities
 */
function getDestinationActivities(destination) {
  // Predefined activities by destination
  const activities = {
    'Nashville (again)': {
      sports: ['Sounds Baseball Game', 'Titans Game (if in season)', 'Predators Game (if in season)'],
      outdoor: ['Cumberland River Kayaking', 'Centennial Park', 'Golf at Hermitage Golf Course'],
      beach: ['Percy Priest Lake Beach Day', 'Pool Day at Accommodation'],
      nightlife: ['Broadway Bar Crawl', 'Printer\'s Alley', 'The Gulch Bars']
    },
    'NYC': {
      sports: ['Yankees Game', 'Mets Game', 'Basketball at Madison Square Garden'],
      outdoor: ['Central Park Exploration', 'High Line Walk', 'Brooklyn Bridge Walk'],
      beach: ['Coney Island Day Trip', 'Rockaway Beach Day'],
      nightlife: ['Greenwich Village Bar Crawl', 'Rooftop Bars Tour', 'Brooklyn Brewery Visit']
    },
    'Chicago': {
      sports: ['Cubs Game at Wrigley Field', 'White Sox Game', 'Bulls Game (if in season)'],
      outdoor: ['Lakefront Bike Ride', 'Millennium Park', 'Lincoln Park Zoo'],
      beach: ['North Avenue Beach', 'Oak Street Beach'],
      nightlife: ['River North Bars', 'Wicker Park Bar Crawl', 'Blues Club Visit']
    },
    'LA': {
      sports: ['Dodgers Game', 'Lakers Game (if in season)', 'Clippers Game (if in season)'],
      outdoor: ['Griffith Park Hike', 'Hollywood Hills Hike', 'Venice Bike Path'],
      beach: ['Santa Monica Beach', 'Venice Beach', 'Malibu Beach'],
      nightlife: ['Hollywood Clubs', 'Downtown LA Bars', 'Craft Brewery Tour']
    },
    'Austin': {
      sports: ['University of Texas Game', 'Round Rock Express Game', 'Austin FC Game (if in season)'],
      outdoor: ['Barton Springs Pool', 'Lady Bird Lake Kayaking', 'Zilker Park'],
      beach: ['Lake Travis Beach Day', 'Barton Creek Greenbelt Swimming'],
      nightlife: ['Sixth Street Bar Crawl', 'Rainey Street', 'Live Music Venues Tour']
    },
    'Boston': {
      sports: ['Red Sox Game at Fenway', 'Celtics Game (if in season)', 'Bruins Game (if in season)'],
      outdoor: ['Freedom Trail Walk', 'Boston Common', 'Boston Harbor Islands'],
      beach: ['Carson Beach', 'Revere Beach', 'Spectacle Island'],
      nightlife: ['Faneuil Hall Bars', 'Fenway Bars', 'Seaport District Nightlife']
    },
    'Charleston': {
      sports: ['Charleston RiverDogs Game', 'College of Charleston Game'],
      outdoor: ['Historic Charleston Walking Tour', 'Shem Creek Paddleboarding', 'Angel Oak Tree Visit'],
      beach: ['Folly Beach', 'Sullivan\'s Island', 'Isle of Palms'],
      nightlife: ['King Street Bar Crawl', 'Upper King Street', 'Cocktail Club']
    }
  };
  
  // Default to Nashville if destination not found
  return activities[destination] || activities['Nashville (again)'];
}

async function generateIndividualPlans(surveyData, destination, dates, individualBudgets) {
  const plans = {};
  
  // Get destination information and events once for all travelers
  const destinationOptions = await getIndividualTravelOptions(null, destination, dates);
  
  for (const response of surveyData) {
    const name = response.Name;
    const departureCity = response['Where would you be flying out of? (Helps me put individual budgets together)'];
    
    plans[name] = {
      name,
      email: response['Email Address'],
      phone: response['Phone Number'],
      travelDetails: {
        origin: departureCity,
        destination,
        dates: {
          departure: dates.startDate,
          return: dates.endDate
        }
      },
      localCosts: destinationOptions?.localInfo?.estimatedCosts || null,
      suggestedEvents: destinationOptions?.events?.byCategory || null,
      budget: {
        localBudget: individualBudgets[name],
        estimatedDailyCosts: calculateDailyCosts(
          destinationOptions?.localInfo,
          individualBudgets[name]?.range
        )
      },
      notes: []
    };

    // Add notes about local costs and events
    if (destinationOptions?.localInfo) {
      plans[name].notes.push(
        `Estimated daily costs for ${destination}: $${plans[name].budget.estimatedDailyCosts.total}/day`,
        `${destinationOptions.events.all.length} events found during your stay`
      );
    }
  }

  return plans;
}

/**
 * Enhanced flight and event price fetching for individual profiles
 */
async function getIndividualTravelOptions(origin, destination, dates) {
  try {
    // Get events during the trip dates
    const events = await Promise.all([
      getTicketmasterEvents(destination, dates),
      getEventbriteEvents(destination, dates),
      // Commented out until API access is available
      // getSeatGeekEvents(destination, dates),
      // getKayakPrices(origin, destination, dates),
      // getAmadeusPrices(origin, destination, dates),
      // getSkyscannerPrices(origin, destination, dates)
    ]);

    // Get local prices using Google Places API
    const localPrices = await getGooglePlacesInfo(destination);

    return {
      events: categorizeEvents([...events[0], ...events[1]]),
      localInfo: localPrices,
      // Flight options commented out until APIs are available
      // flightOptions: categorizeFlightOptions(allFlights)
    };
  } catch (error) {
    console.error(`Error fetching travel options: ${error.message}`);
    return null;
  }
}

/**
 * Fetch events from Ticketmaster
 */
async function getTicketmasterEvents(destination, dates) {
  try {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    const response = await axios.get(
      `https://app.ticketmaster.com/discovery/v2/events.json`,
      {
        params: {
          apikey: apiKey,
          city: destination,
          startDateTime: `${dates.startDate}T00:00:00Z`,
          endDateTime: `${dates.endDate}T23:59:59Z`,
          size: 100
        }
      }
    );

    return response.data._embedded?.events?.map(event => ({
      name: event.name,
      type: 'ticketmaster',
      date: event.dates.start.dateTime,
      venue: event._embedded?.venues?.[0]?.name || 'Venue TBD',
      priceRange: event.priceRanges ? {
        min: event.priceRanges[0].min,
        max: event.priceRanges[0].max
      } : null,
      url: event.url
    })) || [];
  } catch (error) {
    console.error('Error fetching Ticketmaster events:', error);
    return [];
  }
}

/**
 * Fetch events from Eventbrite
 */
async function getEventbriteEvents(destination, dates) {
  try {
    const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
    const response = await axios.get(
      `https://www.eventbriteapi.com/v3/events/search/`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          'location.address': destination,
          'start_date.range_start': `${dates.startDate}T00:00:00Z`,
          'start_date.range_end': `${dates.endDate}T23:59:59Z`,
          'expand': 'venue'
        }
      }
    );

    return response.data.events.map(event => ({
      name: event.name.text,
      type: 'eventbrite',
      date: event.start.local,
      venue: event.venue?.name || 'Venue TBD',
      priceRange: event.ticket_availability ? {
        min: event.ticket_availability.minimum_ticket_price.major_value,
        max: event.ticket_availability.maximum_ticket_price.major_value
      } : null,
      url: event.url
    }));
  } catch (error) {
    console.error('Error fetching Eventbrite events:', error);
    return [];
  }
}

/**
 * Fetch local information using Google Places API
 */
async function getGooglePlacesInfo(destination) {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    // First, get place ID for the destination
    const placeResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json`,
      {
        params: {
          input: destination,
          inputtype: 'textquery',
          key: apiKey
        }
      }
    );

    const placeId = placeResponse.data.candidates[0]?.place_id;
    
    if (!placeId) {
      throw new Error('Place ID not found');
    }

    // Get detailed place information
    const detailsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json`,
      {
        params: {
          place_id: placeId,
          fields: 'price_level,rating,user_ratings_total,formatted_address',
          key: apiKey
        }
      }
    );

    const details = detailsResponse.data.result;
    
    return {
      priceLevel: details.price_level, // 0-4, representing price level
      rating: details.rating,
      totalRatings: details.user_ratings_total,
      address: details.formatted_address,
      estimatedCosts: {
        budget: calculateEstimatedCosts('budget', details.price_level),
        moderate: calculateEstimatedCosts('moderate', details.price_level),
        luxury: calculateEstimatedCosts('luxury', details.price_level)
      }
    };
  } catch (error) {
    console.error('Error fetching Google Places info:', error);
    return null;
  }
}

/**
 * Helper function to estimate costs based on price level
 */
function calculateEstimatedCosts(category, priceLevel) {
  const baseCosts = {
    budget: { food: 30, activities: 20, transport: 15 },
    moderate: { food: 50, activities: 40, transport: 25 },
    luxury: { food: 80, activities: 70, transport: 40 }
  };

  const multiplier = (priceLevel || 2) / 2;
  const costs = baseCosts[category];

  return {
    foodPerDay: Math.round(costs.food * multiplier),
    activitiesPerDay: Math.round(costs.activities * multiplier),
    transportPerDay: Math.round(costs.transport * multiplier)
  };
}

/**
 * Categorize events by type and price range
 */
function categorizeEvents(events) {
  const categorized = {
    entertainment: [],
    sports: [],
    music: [],
    other: []
  };

  events.forEach(event => {
    if (event.name.toLowerCase().includes('concert') || event.type === 'music') {
      categorized.music.push(event);
    } else if (event.name.toLowerCase().includes('game') || event.type === 'sports') {
      categorized.sports.push(event);
    } else if (event.type === 'entertainment') {
      categorized.entertainment.push(event);
    } else {
      categorized.other.push(event);
    }
  });

  return {
    byCategory: categorized,
    byPrice: {
      budget: events.filter(e => e.priceRange?.min < 50),
      moderate: events.filter(e => e.priceRange?.min >= 50 && e.priceRange?.min < 100),
      premium: events.filter(e => e.priceRange?.min >= 100)
    },
    all: events
  };
}

function formatTripPlanOutput(tripPlan) {
  // Format and structure the output for better readability
  const { tripSummary, groupPreferences, itinerary, individualPlans } = tripPlan;
  
  // Format the destination name
  if (tripSummary.destination === "Nashville (again)") {
    tripSummary.destination = "Nashville";
  }
  
  // Format date range
  const startDate = new Date(tripSummary.dateRange.split(' to ')[0]);
  const endDate = new Date(tripSummary.dateRange.split(' to ')[1]);
  tripSummary.dateRange = `${startDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric'})} - ${endDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}`;
  
  // Create a structured budget summary
  tripSummary.budgetBreakdown = {
    perPersonTotal: `$${tripSummary.estimatedGroupCost.totalEstimatedCost}`,
    perDay: `$${tripSummary.estimatedGroupCost.perPersonPerDay}/day`,
    accommodation: `$${tripSummary.estimatedGroupCost.accommodation}`,
    food: `$${tripSummary.estimatedGroupCost.food}`,
    activities: `$${tripSummary.estimatedGroupCost.activities}`,
    localTransport: `$${tripSummary.estimatedGroupCost.localTransport}`
  };
  
  // Add custom notes based on analysis
  tripSummary.notes = [];
  
  if (tripSummary.estimatedGroupCost.notes) {
    tripSummary.notes.push(tripSummary.estimatedGroupCost.notes);
  }
  
  // Format itinerary for better display
  const formattedItinerary = itinerary.map(day => {
    return {
      day: day.day,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      schedule: day.activities.map(item => `${item.time}: ${item.activity}`)
    };
  });
  
  // Format individual plans
  const formattedIndividualPlans = Object.values(individualPlans).map(plan => {
    return {
      name: plan.name,
      travelDetails: `From: ${plan.travelFrom}`,
      flightCost: `$${plan.estimatedFlightCost}`,
      totalBudget: `$${plan.totalEstimatedCost}`,
      notes: plan.specialNotes
    };
  });
  
  return {
    summary: tripSummary,
    preferences: groupPreferences,
    itinerary: formattedItinerary,
    individualPlans: formattedIndividualPlans
  };
}

function generateTripReport(tripPlan) {
  const formatted = formatTripPlanOutput(tripPlan);
  
  let report = `# DipCon ${new Date().getFullYear()} Trip Plan\n\n`;
  
  // Add summary section
  report += `## Trip Summary\n\n`;
  report += `**Destination:** ${formatted.summary.destination}\n`;
  report += `**Dates:** ${formatted.summary.dateRange}\n`;
  report += `**Duration:** ${formatted.summary.duration}\n`;
  report += `**Accommodation:** ${formatted.summary.accommodation}\n\n`;
  
  // Add budget section
  report += `## Budget Breakdown\n\n`;
  report += `- **Total Per Person:** ${formatted.summary.budgetBreakdown.perPersonTotal}\n`;
  report += `- **Per Day:** ${formatted.summary.budgetBreakdown.perDay}\n`;
  report += `- **Accommodation:** ${formatted.summary.budgetBreakdown.accommodation}\n`;
  report += `- **Food:** ${formatted.summary.budgetBreakdown.food}\n`;
  report += `- **Activities:** ${formatted.summary.budgetBreakdown.activities}\n`;
  report += `- **Local Transportation:** ${formatted.summary.budgetBreakdown.localTransport}\n\n`;
  
  if (formatted.summary.notes.length > 0) {
    report += `**Notes:** ${formatted.summary.notes.join(', ')}\n\n`;
  }
  
  // Add group preferences section
  report += `## Group Preferences\n\n`;
  report += `**Top Locations:**\n`;
  formatted.preferences.topLocations.forEach(location => {
    report += `- ${location.location}\n`;
  });
  
  report += `\n**Top Activities:**\n`;
  formatted.preferences.topActivities.forEach(activity => {
    report += `- ${activity}\n`;
  });
  
  report += `\n**Preferred Dining:**\n`;
  formatted.preferences.preferredDining.forEach(dining => {
    report += `- ${dining}\n`;
  });
  
  // Add itinerary section
  report += `\n## Itinerary\n\n`;
  formatted.itinerary.forEach(day => {
    report += `### Day ${day.day}: ${day.date} (${day.dayOfWeek})\n\n`;
    day.schedule.forEach(item => {
      report += `- ${item}\n`;
    });
    report += `\n`;
  });
  
  // Add individual plans section
  report += `## Individual Travel Plans\n\n`;
  formatted.individualPlans.forEach(plan => {
    report += `### ${plan.name}\n\n`;
    report += `- **Travel:** ${plan.travelDetails}\n`;
    report += `- **Estimated Flight Cost:** ${plan.flightCost}\n`;
    report += `- **Total Budget:** ${plan.totalBudget}\n`;
    
    if (plan.notes.length > 0) {
      report += `- **Notes:**\n`;
      plan.notes.forEach(note => {
        report += `  - ${note}\n`;
      });
    }
    report += `\n`;
  });
  
  return report;
}

/**
 * Parse date range and duration preference into specific dates
 */
function parseDateRange(dateRange, durationPreference) {
  // Map date ranges to actual date spans
  const dateRangeMap = {
    'Late June (16-30)': { start: '2025-06-16', end: '2025-06-30' },
    'Early July (1-15)': { start: '2025-07-01', end: '2025-07-15' },
    'Late July (16-31)': { start: '2025-07-16', end: '2025-07-31' },
    'Early August (1-15)': { start: '2025-08-01', end: '2025-08-15' }
  };
  
  // Map duration preferences to number of days
  const durationDays = {
    '2 Days': 2,
    '3-4 Days': 4,
    '5-7 Days': 6
  };
  
  // Get date range or use default
  const range = dateRangeMap[dateRange] || { start: '2025-07-01', end: '2025-07-15' };
  const days = durationDays[durationPreference] || 4;
  
  // Choose a start date in the middle of the range
  const rangeStart = new Date(range.start);
  const rangeEnd = new Date(range.end);
  const rangeDays = Math.round((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000));
  
  // If duration is longer than available days, start at beginning
  const offsetDays = days > rangeDays ? 0 : Math.floor((rangeDays - days) / 2);
  
  const startDate = new Date(rangeStart);
  startDate.setDate(rangeStart.getDate() + offsetDays);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + days - 1);
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    durationDays: days,
    dateRange: dateRange
  };
}

/**
 * Helper function to format dates
 */
function formatDate(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Main function that orchestrates the trip planning
async function generateTripPlan(csvFilePath) {
  try {
    // 1. Parse the CSV data
    const surveyData = await parseSurveyData(csvFilePath);
    
    // 2. Analyze key components
    const budgetAnalysis = analyzeBudgets(surveyData);
    const dateAnalysis = analyzeDatePreferences(surveyData);
    const locationAnalysis = analyzeLocationPreferences(surveyData);
    const activityAnalysis = analyzeActivityPreferences(surveyData);
    const accommodationAnalysis = analyzeAccommodationPreferences(surveyData);
    const diningAnalysis = analyzeDiningPreferences(surveyData);
    
    // 3. Determine optimal trip parameters
    const optimalDestination = locationAnalysis.topLocation;
    const optimalDateRange = dateAnalysis.optimalDateRange;
    const optimalDuration = dateAnalysis.optimalDuration;
    const optimalAccommodation = accommodationAnalysis.topChoice;
    
    // 4. Calculate budget
    const tripBudget = calculateTripBudget(
      optimalDestination, 
      dateAnalysis,
      optimalAccommodation,
      budgetAnalysis.groupBudget.optimal
    );
    
    // 5. Generate itinerary
    const tripDates = parseDateRange(optimalDateRange, optimalDuration);
    const itinerary = generateItinerary(
      optimalDestination,
      tripDates,
      activityAnalysis.topActivities,
      diningAnalysis.preferences
    );
    
    // 6. Create individual travel plans
    const individualPlans = await generateIndividualPlans(
      surveyData,
      optimalDestination,
      tripDates,
      budgetAnalysis.individualBudgets
    );
    
    // 7. Return complete trip plan
    return {
      tripSummary: {
        destination: optimalDestination,
        dateRange: `${tripDates.startDate} to ${tripDates.endDate}`,
        duration: `${tripDates.durationDays} days`,
        accommodation: optimalAccommodation,
        estimatedGroupCost: tripBudget
      },
      groupPreferences: {
        topLocations: locationAnalysis.rankedLocations.slice(0, 3),
        topActivities: activityAnalysis.topActivities.slice(0, 5),
        preferredDining: diningAnalysis.preferences
      },
      itinerary: itinerary,
      individualPlans: individualPlans,
      rawAnalysis: {
        budget: budgetAnalysis,
        dates: dateAnalysis,
        locations: locationAnalysis,
        activities: activityAnalysis,
        accommodations: accommodationAnalysis,
        dining: diningAnalysis
      }
    };
  } catch (error) {
    console.error('Error generating trip plan:', error);
    throw error;
  }
}

// Export all necessary functions
module.exports = {
  generateTripPlan,
  parseSurveyData,
  analyzeBudgets,
  analyzeDatePreferences,
  analyzeLocationPreferences,
  analyzeActivityPreferences,
  analyzeAccommodationPreferences,
  analyzeDiningPreferences,
  calculateTripBudget,
  generateItinerary,
  generateIndividualPlans,
  parseDateRange,
  formatTripPlanOutput,
  generateTripReport
};

async function getCachedPrice(key, fetchFunction) {
  const cached = priceCache.get(key);
  if (cached) return cached;
  
  const price = await fetchFunction();
  priceCache.set(key, price);
  return price;
}

function calculateDefaultBudget(destination, duration, accommodationType, optimalBudget) {
  // Your existing budget calculation logic here
  // This serves as a fallback when real-world data can't be fetched
}

/**
 * Get airport code from city name
 */
function getAirportCode(cityName) {
  if (!cityName) return null;
  
  // Normalize the city name for comparison
  const normalizedCity = cityName.toLowerCase().trim();
  
  // Find the first airport that matches the city
  const airport = AIRPORT_CODES[normalizedCity];
  
  return airport || null;
}

/**
 * Calculate daily costs based on local info and budget range
 * @param {Object} localInfo Local price information
 * @param {string} budgetRange Budget range preference
 * @returns {Object} Daily cost breakdown
 */
function calculateDailyCosts(localInfo, budgetRange = 'moderate') {
  const baseCosts = {
    budget: {
      food: 40,
      activities: 30,
      transport: 20,
      total: 90
    },
    moderate: {
      food: 60,
      activities: 50,
      transport: 30,
      total: 140
    },
    luxury: {
      food: 100,
      activities: 80,
      transport: 50,
      total: 230
    }
  };

  // If we have local info, adjust based on price level
  if (localInfo?.priceLevel) {
    const multiplier = (localInfo.priceLevel + 3) / 4; // Convert 0-4 scale to 0.75-1.75
    const costs = baseCosts[budgetRange];
    
    return {
      food: Math.round(costs.food * multiplier),
      activities: Math.round(costs.activities * multiplier),
      transport: Math.round(costs.transport * multiplier),
      total: Math.round(costs.total * multiplier)
    };
  }

  // Return base costs if no local info available
  return baseCosts[budgetRange] || baseCosts.moderate;
}

/**
 * Calculate default accommodation costs
 */
function calculateDefaultAccommodationCost(destination, accommodationType) {
  const baseCosts = {
    'Nashville (again)': { hotel: 200, airbnb: 150, resort: 300 },
    'NYC': { hotel: 300, airbnb: 250, resort: 400 },
    'Chicago': { hotel: 250, airbnb: 200, resort: 350 },
    'Charleston': { hotel: 220, airbnb: 180, resort: 320 },
    // Add more destinations as needed
  };

  const defaultCosts = { hotel: 200, airbnb: 150, resort: 300 };
  const destinationCosts = baseCosts[destination] || defaultCosts;
  
  return destinationCosts[accommodationType.toLowerCase()] || destinationCosts.hotel;
}
