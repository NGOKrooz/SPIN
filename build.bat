@echo off
REM SPIN Build Script for Windows/Cursor Deployment
echo 🚀 Starting SPIN build process...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

echo ✅ Node.js version:
node --version

REM Clean previous builds
echo 🧹 Cleaning previous builds...
if exist client\node_modules rmdir /s /q client\node_modules
if exist client\build rmdir /s /q client\build
if exist server\node_modules rmdir /s /q server\node_modules
if exist node_modules rmdir /s /q node_modules

REM Install root dependencies
echo 📦 Installing root dependencies...
npm install --production=false
if %errorlevel% neq 0 (
    echo ❌ Failed to install root dependencies!
    exit /b 1
)

REM Install server dependencies
echo 📦 Installing server dependencies...
cd server
npm install --production=false
if %errorlevel% neq 0 (
    echo ❌ Failed to install server dependencies!
    exit /b 1
)
cd ..

REM Install client dependencies
echo 📦 Installing client dependencies...
cd client
npm install --production=false
if %errorlevel% neq 0 (
    echo ❌ Failed to install client dependencies!
    exit /b 1
)

REM Verify react-scripts is installed
if not exist "node_modules\.bin\react-scripts.cmd" (
    echo ❌ react-scripts not found! Installing...
    npm install react-scripts --save
    if %errorlevel% neq 0 (
        echo ❌ Failed to install react-scripts!
        exit /b 1
    )
)

REM Build client
echo 🔨 Building client...
npm run build
if %errorlevel% neq 0 (
    echo ❌ Client build failed!
    exit /b 1
)
cd ..

echo ✅ Build completed successfully!
echo 🎉 SPIN is ready for deployment!
pause
