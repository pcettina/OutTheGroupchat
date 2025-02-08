const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const UserProfile = require('../models/userProfile');
const { check, validationResult } = require('express-validator');

// Get current user's profile
router.get('/me', auth, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ user: req.user.userId })
      .populate('user', ['name', 'email']);

    if (!profile) {
      return res.status(404).json({ msg: 'Profile not found' });
    }

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Create or update profile
router.post('/', [auth, [
  check('locationPreferences', 'At least one location preference is required')
    .isArray().not().isEmpty()
]], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    locationPreferences,
    rewardsPrograms,
    travelPreferences
  } = req.body;

  // Build profile object
  const profileFields = {
    user: req.user.userId,
    locationPreferences,
    rewardsPrograms: rewardsPrograms || [],
    travelPreferences: travelPreferences || {},
    lastUpdated: Date.now()
  };

  try {
    let profile = await UserProfile.findOne({ user: req.user.userId });

    if (profile) {
      // Update
      profile = await UserProfile.findOneAndUpdate(
        { user: req.user.userId },
        { $set: profileFields },
        { new: true }
      );
    } else {
      // Create
      profile = new UserProfile(profileFields);
      await profile.save();
    }

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Delete profile
router.delete('/', auth, async (req, res) => {
  try {
    await UserProfile.findOneAndDelete({ user: req.user.userId });
    res.json({ msg: 'Profile deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router; 