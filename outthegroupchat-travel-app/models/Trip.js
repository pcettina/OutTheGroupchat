const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tripSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  destination: {
    country: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    additionalStops: [{
      country: String,
      city: String,
      duration: Number // days at this stop
    }]
  },
  dateRange: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  budget: {
    flight: {
      type: Number,
      default: 0
    },
    accommodation: {
      type: Number,
      default: 0
    },
    dailyExpenses: {
      type: Number,
      default: 0
    },
    totalBudget: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    budgetScore: {
      type: Number
    }
  },
  travelDetails: {
    flightPreferences: {
      airline: String,
      seatType: {
        type: String,
        enum: ['economy', 'premium economy', 'business', 'first']
      },
      rewardsUsed: Boolean
    },
    accommodation: {
      type: {
        type: String,
        enum: ['hotel', 'hostel', 'airbnb', 'resort', 'other']
      },
      name: String,
      bookingConfirmation: String
    },
    groupSize: {
      type: Number,
      default: 1
    }
  },
  activities: [{
    name: String,
    date: Date,
    cost: Number,
    booked: {
      type: Boolean,
      default: false
    },
    priority: {
      type: String,
      enum: ['must-do', 'would-like', 'if-time-permits'],
      default: 'would-like'
    }
  }],
  status: {
    type: String,
    enum: ['planning', 'booked', 'in-progress', 'completed', 'cancelled'],
    default: 'planning'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Trip', tripSchema); 