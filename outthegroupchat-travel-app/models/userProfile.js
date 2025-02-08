const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userProfileSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  locationPreferences: [{
    country: String,
    city: String
  }],
  rewardsPrograms: [{
    programName: String,
    membershipId: String,
    membershipLevel: String
  }],
  budgetScore: Number,
  travelPreferences: {
    preferredAirlines: [String],
    preferredHotelChains: [String],
    seatPreference: String,
    dietaryRestrictions: [String]
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('UserProfile', userProfileSchema);
