const express = require('express');
const mongoose = require('mongoose');
const UserProfile = require('./models/userProfile');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const tripRoutes = require('./routes/trips');
require('dotenv').config();

const app = express();
app.use(express.json());

// Basic health check route
app.get('/', (req, res) => {
  res.send('Server is up and running!');
});

// GET all users
app.get('/users', async (req, res) => {
  try {
    const users = await UserProfile.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// GET single user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const user = await UserProfile.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user' });
  }
});

// POST create new user
app.post('/users', async (req, res) => {
  try {
    console.log('Received request body:', req.body);
    const newUser = new UserProfile(req.body);
    console.log('Created new user object:', newUser);
    await newUser.save();
    console.log('User saved successfully');
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).json({ error: error.message });
  }
});

// PUT update user
app.put('/users/:id', async (req, res) => {
  try {
    const updatedUser = await UserProfile.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE user
app.delete('/users/:id', async (req, res) => {
  try {
    const deletedUser = await UserProfile.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting user' });
  }
});

// Calculate budget score endpoint
app.post('/users/:id/calculate-budget', async (req, res) => {
  try {
    const user = await UserProfile.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const budgetResult = user.calculateBudgetScore(req.body);
    await user.save();
    
    res.json({
      userId: user._id,
      username: user.username,
      budgetScore: budgetResult.budgetScore,
      breakdown: budgetResult.breakdown,
      interpretation: {
        1: "Budget-friendly",
        2: "Moderate",
        3: "Luxury"
      }[budgetResult.budgetScore]
    });
  } catch (error) {
    console.error('Budget calculation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Connect to DB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database_name';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/trips', tripRoutes); 