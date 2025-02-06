const UserProfile = require('./models/userProfile');

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

