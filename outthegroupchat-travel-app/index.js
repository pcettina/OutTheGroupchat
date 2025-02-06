// index.js
require('dotenv').config();
const mongoose = require('mongoose');
const UserProfile = require('./models/userProfile');

// Connect to MongoDB (replace with your actual connection string)
mongoose.connect('mongodb://localhost:27017/your_database_name')
  .then(() => {
    console.log('Connected to MongoDB successfully');

    // (2) Once connected, create a new user
    return createNewUser();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// Example function to create a new user and calculate budget score
async function createNewUser() {
  try {
    // Create a user instance
    const newUser = new UserProfile({
      username: 'traveler123',
      email: 'traveler@example.com',
      password: 'securepassword123',
      locationPreferences: [
        {
          country: 'Japan',
          city: 'Tokyo',
        },
      ],
      rewardsPrograms: [
        {
          programName: 'Airline Miles',
          membershipId: 'XYZ123',
          membershipLevel: 'Silver',
        },
      ],
    });

    // Calculate budget score
    const budgetRanges = {
      flight: 300,
      accommodation: 100,
      dailyExpenses: 50,
    };
    newUser.calculateBudgetScore(budgetRanges);

    // Save to MongoDB
    const savedUser = await newUser.save();
    console.log('User saved successfully:', savedUser);

    // Exit the process (for demo purposes)
    process.exit(0);
  } catch (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }
}
