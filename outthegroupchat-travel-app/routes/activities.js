const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trip = require('../models/Trip');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');

// Add activity to trip (with duplicate check)
router.post('/trips/:tripId/activities', [auth, [
  check('name', 'Activity name is required').not().isEmpty(),
  check('date', 'Valid date is required').isISO8601()
]], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    // Create new activity
    const newActivity = {
      name: req.body.name,
      date: req.body.date,
      location: req.body.location,
      timing: req.body.timing,
      costDetails: req.body.costDetails,
      bookingInfo: req.body.bookingInfo,
      requirements: req.body.requirements
    };

    // Update budget using costDetails.basePrice instead of cost
    const activityCost = req.body.costDetails?.basePrice || 0;
    trip.budget.totalBudget = (trip.budget.totalBudget || 0) + activityCost;

    trip.activities.push(newActivity);
    trip.lastUpdated = Date.now();

    await trip.save();
    res.json(trip.activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Enhanced GET route with metadata filtering
router.get('/trips/:tripId/activities', auth, async (req, res) => {
  try {
    const {
      date,
      priceRange,
      accessibility,
      physicalLevel,
      crowdLevel,
      bookingRequired,
      timeOfDay
    } = req.query;

    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    let activities = Array.from(trip.activities);

    // Apply filters
    if (date) {
      const filterDate = new Date(date).toDateString();
      activities = activities.filter(activity => 
        new Date(activity.date).toDateString() === filterDate
      );
    }

    if (priceRange) {
      activities = activities.filter(activity => 
        activity.costDetails?.priceRange === priceRange
      );
    }

    if (accessibility) {
      activities = activities.filter(activity => 
        activity.requirements?.accessibility?.wheelchairAccessible === (accessibility === 'true')
      );
    }

    if (physicalLevel) {
      activities = activities.filter(activity => 
        activity.requirements?.physicalLevel === physicalLevel
      );
    }

    if (crowdLevel) {
      activities = activities.filter(activity => 
        activity.timing?.crowdLevels?.typical === crowdLevel
      );
    }

    if (bookingRequired) {
      activities = activities.filter(activity => 
        activity.bookingInfo?.advanceBookingRequired === (bookingRequired === 'true')
      );
    }

    if (timeOfDay) {
      activities = activities.filter(activity => 
        activity.timing?.bestTimeOfDay?.includes(timeOfDay)
      );
    }

    // Sort by date
    activities.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      total: activities.length,
      activities: activities
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Delete activity from trip
router.delete('/trips/:tripId/activities/:activityId', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    // Find activity index
    const activityIndex = trip.activities.findIndex(
      activity => activity._id.toString() === req.params.activityId
    );

    if (activityIndex === -1) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    // Subtract activity cost from total budget
    trip.budget.totalBudget -= trip.activities[activityIndex].costDetails.cost;

    // Remove activity
    trip.activities.splice(activityIndex, 1);
    trip.lastUpdated = Date.now();

    await trip.save();

    res.json({ msg: 'Activity removed', activities: trip.activities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Share activity with other users
router.post('/trips/:tripId/activities/:activityId/share', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    // Update sharing status
    activity.sharing.status = 'public';
    activity.sharing.originalCreator = req.user.userId;
    activity.sharing.shareCount += 1;

    await trip.save();
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Save/bookmark activity
router.post('/activities/:activityId/save', auth, async (req, res) => {
  try {
    const sourceTrip = await Trip.findOne({
      'activities._id': req.params.activityId
    });

    if (!sourceTrip) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    const activity = sourceTrip.activities.id(req.params.activityId);
    activity.sharing.saves += 1;

    await sourceTrip.save();
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get single activity with all details
router.get('/trips/:tripId/activities/:activityId', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    
    if (!activity) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    // Ensure engagement structure exists
    if (!activity.engagement) {
      activity.engagement = {
        comments: [],
        ratings: {
          average: 0,
          count: 0
        },
        tags: [],
        reviews: [],
        photos: []
      };
    }

    // Populate user info for comments if they exist
    if (activity.engagement.comments && activity.engagement.comments.length > 0) {
      const populatedComments = await Promise.all(
        activity.engagement.comments.map(async (comment) => {
          const user = await User.findById(comment.user).select('name');
          return {
            _id: comment._id,
            text: comment.text,
            date: comment.date,
            user: comment.user,
            userName: user ? user.name : 'Unknown User'
          };
        })
      );
      activity.engagement.comments = populatedComments;
    }

    // Convert to plain object to modify
    const activityObject = activity.toObject();

    // Sort comments by date if they exist
    if (activityObject.engagement.comments) {
      activityObject.engagement.comments.sort((a, b) => b.date - a.date);
    }

    res.json(activityObject);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router; 