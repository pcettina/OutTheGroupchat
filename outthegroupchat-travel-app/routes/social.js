const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trip = require('../models/Trip');
const User = require('../models/User');

// Make activity public/private
router.patch('/trips/:tripId/activities/:activityId/visibility', auth, async (req, res) => {
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

    activity.sharing.status = req.body.status;
    activity.sharing.originalCreator = req.user.userId;
    activity.lastUpdated = Date.now();

    await trip.save();
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Save/bookmark activity (Fixed route)
router.post('/trips/:tripId/activities/:activityId/save', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      'activities._id': req.params.activityId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    
    // Initialize sharing if it doesn't exist
    if (!activity.sharing) {
      activity.sharing = {
        status: 'private',
        saves: 0
      };
    }
    
    // Update save count
    activity.sharing.saves += 1;
    
    // Add to user's saved activities if not already saved
    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { savedActivities: req.params.activityId }
    });

    await trip.save();
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get public activities feed
router.get('/activities/feed', auth, async (req, res) => {
  try {
    const { location, category, limit = 10 } = req.query;
    
    const trips = await Trip.find({
      'activities.sharing.status': 'public'
    }).limit(20);

    let activities = trips.reduce((acc, trip) => {
      const publicActivities = trip.activities.filter(
        activity => activity.sharing.status === 'public'
      );
      return [...acc, ...publicActivities];
    }, []);

    // Apply filters
    if (location) {
      activities = activities.filter(activity => 
        activity.location.address.toLowerCase().includes(location.toLowerCase())
      );
    }

    if (category) {
      activities = activities.filter(activity => 
        activity.category.includes(category)
      );
    }

    // Sort by popularity (saves)
    activities.sort((a, b) => b.sharing.saves - a.sharing.saves);

    res.json(activities.slice(0, limit));
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Add comment to activity
router.post('/trips/:tripId/activities/:activityId/comments', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      'activities._id': req.params.activityId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    
    // Initialize the engagement structure if it doesn't exist
    if (!activity.engagement) {
      activity.engagement = {
        comments: [],
        ratings: { average: 0, count: 0 },
        tags: [],
        reviews: [],
        photos: []
      };
    }

    // Ensure comments array exists
    if (!activity.engagement.comments) {
      activity.engagement.comments = [];
    }

    const newComment = {
      user: req.user.userId,
      text: req.body.text,
      date: new Date()
    };
    
    // Add comment to the beginning of the array
    activity.engagement.comments.unshift(newComment);
    
    // Mark the subdocument as modified
    activity.markModified('engagement.comments');
    
    await trip.save();

    // Return the updated activity
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Rate an activity
router.post('/activities/:activityId/rate', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      'activities._id': req.params.activityId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    
    if (!activity.engagement.ratings) {
      activity.engagement.ratings = { average: 0, count: 0, scores: [] };
    }

    // Add or update rating
    const rating = {
      user: req.user.userId,
      score: req.body.score,
      date: Date.now()
    };

    const existingRatingIndex = activity.engagement.ratings.scores.findIndex(
      r => r.user.toString() === req.user.userId
    );

    if (existingRatingIndex > -1) {
      activity.engagement.ratings.scores[existingRatingIndex] = rating;
    } else {
      activity.engagement.ratings.scores.push(rating);
    }

    // Update average
    const scores = activity.engagement.ratings.scores.map(r => r.score);
    activity.engagement.ratings.average = scores.reduce((a, b) => a + b) / scores.length;
    activity.engagement.ratings.count = scores.length;

    await trip.save();
    res.json(activity.engagement.ratings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Add rating to activity
router.post('/trips/:tripId/activities/:activityId/rate', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      'activities._id': req.params.activityId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    const activity = trip.activities.id(req.params.activityId);
    
    // Initialize the engagement structure if it doesn't exist
    if (!activity.engagement) {
      activity.engagement = {
        comments: [],
        ratings: {
          scores: [],
          average: 0,
          count: 0
        },
        tags: [],
        reviews: [],
        photos: []
      };
    }

    // Ensure ratings structure exists
    if (!activity.engagement.ratings) {
      activity.engagement.ratings = {
        scores: [],
        average: 0,
        count: 0
      };
    }

    // Ensure scores array exists
    if (!activity.engagement.ratings.scores) {
      activity.engagement.ratings.scores = [];
    }

    // Add or update user's rating
    const ratingIndex = activity.engagement.ratings.scores.findIndex(
      r => r.user.toString() === req.user.userId
    );

    const newRating = {
      user: req.user.userId,
      score: req.body.score,
      date: new Date()
    };

    if (ratingIndex > -1) {
      activity.engagement.ratings.scores[ratingIndex] = newRating;
    } else {
      activity.engagement.ratings.scores.push(newRating);
    }

    // Calculate new average
    const scores = activity.engagement.ratings.scores.map(r => r.score);
    activity.engagement.ratings.average = scores.reduce((a, b) => a + b) / scores.length;
    activity.engagement.ratings.count = scores.length;

    // Mark as modified
    activity.markModified('engagement.ratings');
    
    await trip.save();

    res.json(activity.engagement.ratings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router; 