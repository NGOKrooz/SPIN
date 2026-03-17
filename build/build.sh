#!/bin/bash

# SPIN Build Script for Cursor Deployment
echo "🚀 Starting SPIN build process..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf client/node_modules
rm -rf client/build
rm -rf server/node_modules
rm -rf node_modules

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install --production=false

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install --production=false
cd ..

# Install client dependencies
echo "📦 Installing client dependencies..."
cd client
npm install --production=false

# Verify react-scripts is installed
if [ ! -f "node_modules/.bin/react-scripts" ]; then
    echo "❌ react-scripts not found! Installing..."
    npm install react-scripts --save
fi

# Build client
echo "🔨 Building client..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Client build failed!"
    exit 1
fi
cd ..

echo "✅ Build completed successfully!"
echo "🎉 SPIN is ready for deployment!"
