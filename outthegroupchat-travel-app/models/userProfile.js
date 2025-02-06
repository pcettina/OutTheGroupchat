// Remove or update the require statement since this file is defining UserProfile
// const UserProfile = require('./models/userProfile'); // This was causing circular dependency


// Instead, you might want to use mongoose Schema if this is a MongoDB model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define your UserProfile schema and model here
const userProfileSchema = new Schema({
  username: String,
  email: String,
  password: String,
  locationPreferences: [{
    country: String,
    city: String
  }],
  rewardsPrograms: [{
    programName: String,
    membershipId: String,
    membershipLevel: String
  }],
  budgetScore: Number
});

// Add the calculateBudgetScore method to the schema
userProfileSchema.methods.calculateBudgetScore = function(budgetData) {
    // Calculate total trip cost
    const totalFlightCost = budgetData.flight * budgetData.numberOfPeople;
    const totalAccommodationCost = budgetData.accommodation * budgetData.numberOfDays;
    const totalDailyExpenses = budgetData.dailyExpenses * budgetData.numberOfDays * budgetData.numberOfPeople;
    
    const totalTripCost = totalFlightCost + totalAccommodationCost + totalDailyExpenses;
    
    // Calculate budget score (example algorithm)
    // Lower score = more budget-friendly
    // Higher score = more luxury
    let score = 0;
    
    // Flight cost per person scoring
    if (budgetData.flight <= 300) score += 1;
    else if (budgetData.flight <= 600) score += 2;
    else score += 3;
    
    // Accommodation per night scoring
    if (budgetData.accommodation <= 100) score += 1;
    else if (budgetData.accommodation <= 250) score += 2;
    else score += 3;
    
    // Daily expenses per person scoring
    if (budgetData.dailyExpenses <= 50) score += 1;
    else if (budgetData.dailyExpenses <= 150) score += 2;
    else score += 3;
    
    this.budgetScore = score;
    
    return {
        budgetScore: score,
        breakdown: {
            totalCost: totalTripCost,
            flightTotal: totalFlightCost,
            accommodationTotal: totalAccommodationCost,
            expensesTotal: totalDailyExpenses,
            costPerPerson: totalTripCost / budgetData.numberOfPeople,
            costPerDay: totalTripCost / budgetData.numberOfDays
        }
    };
};

// Create and export the model
const UserProfile = mongoose.model('UserProfile', userProfileSchema);
module.exports = UserProfile;

// Create a new user
const newUser = new UserProfile({
  username: 'traveler123',
  email: 'traveler@example.com',
  password: 'securepassword123',
  locationPreferences: [{ country: 'Japan', city: 'Tokyo' }],
  rewardsPrograms: [
    {
      programName: 'Airline Miles',
      membershipId: 'XYZ123',
      membershipLevel: 'Silver'
    },
  ],
});


const budgetRanges = {
  flight: 300,
  accommodation: 120,
  dailyExpenses: 50,
};

newUser.calculateBudgetScore(budgetRanges);
// newUser.budgetScore now has the updated score


newUser.save()
  .then(savedUser => {
    console.log('User profile saved:', savedUser);
  })
  .catch(error => {
    console.error('Error saving user:', error);
  });

