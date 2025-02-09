const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trip = require('../models/Trip');
const { check, validationResult } = require('express-validator');

// Add activity to trip (with duplicate check)
router.post('/trips/:tripId/activities', [auth, [
  check('name', 'Activity name is required').not().isEmpty(),
  check('date', 'Valid date is required').isISO8601(),
  check('cost', 'Cost must be a number').isNumeric(),
  check('priority').isIn(['must-do', 'would-like', 'if-time-permits'])
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

    // Check for existing activity on same date with same name
    const activityExists = trip.activities.some(activity => 
      activity.name === req.body.name && 
      new Date(activity.date).toDateString() === new Date(req.body.date).toDateString()
    );

    if (activityExists) {
      return res.status(400).json({ 
        msg: 'An activity with this name already exists on this date' 
      });
    }

    // Validate activity date is within trip dates
    const activityDate = new Date(req.body.date);
    if (activityDate < trip.dateRange.startDate || activityDate > trip.dateRange.endDate) {
      return res.status(400).json({ msg: 'Activity date must be within trip dates' });
    }

    const newActivity = {
      name: req.body.name,
      date: activityDate,
      cost: req.body.cost,
      priority: req.body.priority,
      booked: req.body.booked || false
    };

    trip.activities.push(newActivity);
    trip.budget.totalBudget += req.body.cost;
    trip.lastUpdated = Date.now();

    await trip.save();

    res.json(trip.activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get activities with optional filters
router.get('/trips/:tripId/activities', auth, async (req, res) => {
  try {
    const { priority, date, booked } = req.query;
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    // First sort all activities by date
    let activities = Array.from(trip.activities).sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });

    // Apply filters if provided
    if (priority) {
      activities = activities.filter(activity => activity.priority === priority);
    }

    if (date) {
      // Convert filter date to YYYY-MM-DD format
      const filterDate = new Date(date);
      const filterYear = filterDate.getUTCFullYear();
      const filterMonth = filterDate.getUTCMonth();
      const filterDay = filterDate.getUTCDate();

      activities = activities.filter(activity => {
        const activityDate = new Date(activity.date);
        return (
          activityDate.getUTCFullYear() === filterYear &&
          activityDate.getUTCMonth() === filterMonth &&
          activityDate.getUTCDate() === filterDay
        );
      });
    }

    if (booked !== undefined) {
      activities = activities.filter(activity => 
        activity.booked === (booked === 'true')
      );
    }

    // Group by date for better organization
    const groupedByDate = activities.reduce((groups, activity) => {
      const activityDate = new Date(activity.date);
      const dateKey = activityDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push({
        ...activity.toObject(),
        time: activityDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      });
      return groups;
    }, {});

    res.json({
      total: activities.length,
      activities: activities,
      groupedByDate: groupedByDate
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
    trip.budget.totalBudget -= trip.activities[activityIndex].cost;

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

module.exports = router; 