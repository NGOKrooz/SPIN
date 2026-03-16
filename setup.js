#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🏥 SPIN - Smart Physiotherapy Internship Network Setup');
console.log('=====================================================\n');

// Check if Node.js is installed
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Node.js version: ${nodeVersion}`);
} catch (error) {
  console.error('❌ Node.js is not installed. Please install Node.js 18+ and try again.');
  process.exit(1);
}

// Check if npm is installed
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`✅ npm version: ${npmVersion}\n`);
} catch (error) {
  console.error('❌ npm is not installed. Please install npm and try again.');
  process.exit(1);
}

// Create .env files
console.log('📝 Creating environment files...');

// Server .env
const serverEnvContent = `PORT=5000
NODE_ENV=development
JWT_SECRET=spin_jwt_secret_key_${Date.now()}
DB_PATH=./database/spin.db
CORS_ORIGIN=http://localhost:3000`;

if (!fs.existsSync('server/.env')) {
  fs.writeFileSync('server/.env', serverEnvContent);
  console.log('✅ Created server/.env');
} else {
  console.log('⚠️  server/.env already exists');
}

// Client .env
const clientEnvContent = `REACT_APP_API_URL=http://localhost:5000/api`;

if (!fs.existsSync('client/.env')) {
  fs.writeFileSync('client/.env', clientEnvContent);
  console.log('✅ Created client/.env');
} else {
  console.log('⚠️  client/.env already exists');
}

// Install dependencies
console.log('\n📦 Installing dependencies...');

try {
  console.log('Installing root dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('Installing server dependencies...');
  execSync('cd server && npm install', { stdio: 'inherit' });
  
  console.log('Installing client dependencies...');
  execSync('cd client && npm install', { stdio: 'inherit' });
  
  console.log('✅ All dependencies installed successfully!\n');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Create database directory
console.log('🗄️  Setting up database...');
if (!fs.existsSync('server/database')) {
  fs.mkdirSync('server/database', { recursive: true });
  console.log('✅ Created database directory');
} else {
  console.log('⚠️  Database directory already exists');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Start the development server: npm run dev');
console.log('2. Open your browser to: http://localhost:3000');
console.log('3. The backend API will be available at: http://localhost:5000');
console.log('\n🏥 Welcome to SPIN - Smart Physiotherapy Internship Network!');
console.log('   University of Nigeria Teaching Hospital, Ituku Ozalla');
console.log('   Physiotherapy Department\n');
