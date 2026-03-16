#!/bin/bash
# Railpack Build Script for SPIN

echo "🚀 Starting Railpack build process..."

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install client dependencies
echo "📦 Installing client dependencies..."
cd client
npm install

# Verify react-scripts is installed
if [ ! -f "node_modules/.bin/react-scripts" ]; then
    echo "❌ react-scripts not found! Installing..."
    npm install react-scripts --save
fi

# Build client
echo "🔨 Building client..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build completed successfully!"
