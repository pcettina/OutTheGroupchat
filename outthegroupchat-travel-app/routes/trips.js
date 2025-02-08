const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Trip = require('../models/Trip');
const { check, validationResult } = require('express-validator');

// Get all trips for current user
router.get('/', auth, async (req, res) => {
  try {
    const trips = await Trip.find({ user: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get single trip
router.get('/:id', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      user: req.user.userId
    });
    
    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }
    
    res.json(trip);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Create new trip
router.post('/', [auth, [
  check('title', 'Title is required').not().isEmpty(),
  check('destination', 'Destination is required').not().isEmpty(),
  check('dateRange', 'Date range is required').not().isEmpty(),
]], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const newTrip = new Trip({
      user: req.user.userId,
      ...req.body
    });

    const trip = await newTrip.save();
    res.json(trip);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Update trip
router.put('/:id', auth, async (req, res) => {
  try {
    let trip = await Trip.findOne({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastUpdated: Date.now() },
      { new: true }
    );

    res.json(trip);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// Delete trip
router.delete('/:id', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      user: req.user.userId
    });

    if (!trip) {
      return res.status(404).json({ msg: 'Trip not found' });
    }

    await trip.remove();
    res.json({ msg: 'Trip removed' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router; 