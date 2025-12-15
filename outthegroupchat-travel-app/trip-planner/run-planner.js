// run-planner.js
const path = require('path');
const { generateTripPlan } = require('./trip-planner');

// Path to your survey data CSV file
const csvFilePath = path.join(__dirname, 'DataFromSurvey', 'DipCon V2 (Responses) - Form Responses 1.csv');

async function runPlanner() {
  try {
    console.log('Starting trip planning process...');
    const tripPlan = await generateTripPlan(csvFilePath);
    
    console.log('Trip plan generated successfully!');
    console.log('\nTrip Summary:');
    console.log(JSON.stringify(tripPlan.tripSummary, null, 2));
    
    console.log('\nIndividual Plans:');
    console.log(JSON.stringify(tripPlan.individualPlans, null, 2));
    
    // Optionally save to a file
    const fs = require('fs');
    const outputPath = path.join(__dirname, 'output', `trip-plan-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(tripPlan, null, 2));
    console.log(`\nFull trip plan saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error generating trip plan:', error);
  }
}

// Run the planner
runPlanner();