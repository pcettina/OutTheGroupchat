const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Trip = require('../models/Trip');

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('savedActivities');
    
    const trips = await Trip.find({ user: req.user.userId });
    
    const profile = {
      ...user.toObject(),
      tripCount: trips.length,
      activityCount: trips.reduce((count, trip) => 
        count + trip.activities.length, 0
      ),
      publicActivities: trips.reduce((activities, trip) => {
        const publicOnes = trip.activities.filter(
          activity => activity.sharing?.status === 'public'
        );
        return [...activities, ...publicOnes];
      }, [])
    };

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Update user profile
router.patch('/profile', auth, async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      bio: req.body.bio,
      location: req.body.location,
      preferences: {
        currency: req.body.currency,
        language: req.body.language,
        timezone: req.body.timezone
      }
    };

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Follow user
router.post('/users/:userId/follow', auth, async (req, res) => {
  try {
    if (req.params.userId === req.user.userId) {
      return res.status(400).json({ msg: 'Cannot follow yourself' });
    }

    const user = await User.findById(req.user.userId);
    const userToFollow = await User.findById(req.params.userId);

    if (!userToFollow) {
      return res.status(404).json({ msg: 'User not found' });
    }

    if (user.following.includes(req.params.userId)) {
      return res.status(400).json({ msg: 'Already following this user' });
    }

    user.following.push(req.params.userId);
    userToFollow.followers.push(req.user.userId);

    await user.save();
    await userToFollow.save();

    res.json({ msg: 'User followed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router; 