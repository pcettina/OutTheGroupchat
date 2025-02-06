const { execSync } = require('child_process');

// Check if npm is installed
try {
    execSync('npm -v');
} catch (error) {
    console.error('npm is not installed. Please install Node.js and npm.');
    process.exit(1);
}

execSync('npm init -y');
