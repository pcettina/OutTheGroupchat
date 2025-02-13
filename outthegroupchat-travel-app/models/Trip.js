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
    },
    sharing: {
      status: {
        type: String,
        enum: ['private', 'public'],
        default: 'private'
      },
      originalCreator: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      shareCount: {
        type: Number,
        default: 0
      },
      saves: {
        type: Number,
        default: 0
      }
    },
    location: {
      coordinates: {
        lat: Number,
        lng: Number
      },
      placeId: String,
      address: String,
      accessibilityNotes: String,
      nearestTransit: [{
        type: {
          type: String,
          enum: ['train', 'bus', 'subway']
        },
        name: String,
        distance: Number,
        directions: String
      }]
    },
    category: [{
      type: String,
      enum: ['food', 'culture', 'shopping', 'nature', 'entertainment', 'transportation']
    }],
    externalLinks: {
      bookingUrl: String,
      websiteUrl: String,
      priceApiEndpoint: String
    },
    duration: {
      hours: Number,
      minutes: Number
    },
    notes: String,
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    weatherDependent: {
      type: Boolean,
      default: false
    },
    timing: {
      duration: {
        hours: Number,
        minutes: Number
      },
      bestTimeOfDay: [String],  // morning, afternoon, evening, night
      seasonality: [String],    // spring, summer, fall, winter
      crowdLevels: {
        typical: {
          type: String,
          enum: ['low', 'moderate', 'high', 'very-high']
        },
        current: String  // For real-time updates
      }
    },
    costDetails: {
      basePrice: Number,
      currency: {
        type: String,
        default: 'USD'
      },
      priceRange: {
        type: String,
        enum: ['$', '$$', '$$$', '$$$$']
      },
      includedItems: [String],
      additionalCosts: [{
        item: String,
        cost: Number
      }]
    },
    bookingInfo: {
      status: {
        type: String,
        enum: ['not-needed', 'recommended', 'required']
      },
      advanceBookingRequired: {
        type: Boolean,
        default: false
      },
      recommendedBookingTime: String, // "2 weeks ahead", "day before", etc.
      cancellationPolicy: String,
      confirmationNumber: String
    },
    engagement: {
      comments: [{
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        text: {
          type: String,
          required: true
        },
        date: {
          type: Date,
          default: Date.now
        }
      }],
      ratings: {
        average: Number,
        count: Number
      },
      tags: [String],
      reviews: [Schema.Types.Mixed],
      photos: [Schema.Types.Mixed]
    },
    requirements: {
      minimumAge: Number,
      physicalLevel: {
        type: String,
        enum: ['easy', 'moderate', 'challenging']
      },
      requiredItems: [String],
      recommendedItems: [String],
      restrictions: [String],
      accessibility: {
        wheelchairAccessible: Boolean,
        familyFriendly: Boolean,
        petFriendly: Boolean
      }
    },
    recommendationData: {
      categories: [String],
      keywords: [String],
      similarActivities: [{
        activityId: Schema.Types.ObjectId,
        similarity: Number  // 0-1 score
      }],
      popularWith: [String],  // demographics or user types
      userPreferences: [String]  // tags for recommendation engine
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