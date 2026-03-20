const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════
// Production Environment Validation (Critical)
// ═══════════════════════════════════════════════════════════
const requiredEnvVars = ['MONGO_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('');
  console.error('═════════════════════════════════════════════════════════');
  console.error('❌ STARTUP ERROR: Missing Required Environment Variables');
  console.error('═════════════════════════════════════════════════════════');
  console.error('');
  console.error('Missing variables:');
  missingEnvVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('');
  console.error('For deployment:');
  console.error('  1. Ensure MONGO_URI is set with MongoDB Atlas connection string');
  console.error('  2. Format: mongodb+srv://<username>:<password>@cluster.mongodb.net/spin?retryWrites=true&w=majority');
  console.error('  3. ADMIN_PASSWORD is optional (recommended for production)');
  console.error('');
  console.error('═════════════════════════════════════════════════════════');
  console.error('');
  process.exit(1);
}

// Log startup configuration (without credentials)
console.log('');
console.log('🚀 SPIN Server Starting...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 Port: ${process.env.PORT || 5000}`);
console.log(`🗄️  Database: MongoDB Atlas`);
console.log(`🔒 Admin Auth: ${process.env.ADMIN_PASSWORD ? 'Configured ✓' : 'Not Set ⚠️'}`);
console.log(`🔄 Auto-Rotation: ${process.env.AUTO_ROTATION !== 'false' ? 'Enabled' : 'Disabled'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - CORS configuration
app.use(cors({
  origin: "https://spin-interns.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));

// Handle preflight
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic request logging to help diagnose errors in production
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// CORS headers fallback for environments behind proxies
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://spin-interns.vercel.app");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
  next();
});

// Admin authorization middleware for write operations
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
function requireAdminForWrites(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
  if (!isWrite) return next();

  if (!ADMIN_PASSWORD) {
    console.warn('ADMIN_PASSWORD is not set. Blocking write operation.');
    return res.status(403).json({ error: 'Admin not configured on server' });
  }

  const key = req.header('x-admin-key') || '';
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  next();
}

// Health check endpoint - define early so it's always available
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SPIN API is running',
    timestamp: new Date().toISOString()
  });
});

// Test DB endpoint
app.get('/test-db', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;

    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }

    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      return res.json({ message: 'No collections found', collections: [] });
    }

    const collectionName = collections[0].name;
    const collection = db.collection(collectionName);
    const records = await collection.find({}).limit(10).toArray();
    res.json({ collection: collectionName, records });
  } catch (error) {
    console.error('Test DB error:', error);
    res.status(500).json({ error: 'Database test failed', details: error.message });
  }
});

// Apply admin protection to all API write routes
app.use('/api', requireAdminForWrites);

// Auth helper: verify admin key
app.get('/api/auth/verify-admin', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin not configured' });
  }
  const key = req.header('x-admin-key') || '';
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  res.json({ ok: true });
});

// Routes - wrap in try-catch to prevent server crash if route loading fails
try {
  app.use('/api/interns', require('./routes/interns'));
  app.use('/api/units', require('./routes/units'));
  app.use('/api/rotations', require('./routes/rotations'));
  app.use('/api/activity', require('./routes/activity'));
  app.use('/api/settings', require('./routes/settings').router);
  app.use('/api/config', require('./routes/config'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/debug', require('./routes/debug'));
  console.log('✅ All routes loaded successfully');
} catch (routeError) {
  console.error('❌ Error loading routes:', routeError);
  // Don't exit - health endpoint should still work
  app.use('/api/*', (req, res) => {
    res.status(500).json({ 
      error: 'Route loading failed', 
      message: process.env.NODE_ENV === 'development' ? routeError.message : 'Internal server error'
    });
  });
}

// Serve React build if it exists (works in production containers without NODE_ENV)
const buildPath = path.join(__dirname, '../client/build');
if (fs.existsSync(buildPath)) {
  // Serve static files; prevent caching of HTML to avoid stale bundles
  app.use(express.static(buildPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  // Non-API routes should serve the SPA
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  // 404 handler when no frontend build is present
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// Error handling middleware - must be last
app.use((err, req, res, next) => {
  console.error('GLOBAL ERROR:', err.stack || err);

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Initialize database and start server
const connectDB = require('./config/database');

let databaseReady = false;

async function seedDefaultData() {
  try {
    const Unit = require('./models/Unit');
    const Intern = require('./models/Intern');
    const Rotation = require('./models/Rotation');

    // Check if units collection is empty
    const existingUnits = await Unit.find();
    if (existingUnits.length === 0) {
      console.log('🌱 Seeding default units...');
      await Unit.create([
        { name: 'General Medicine', order: 1, description: 'General medical unit' },
        { name: 'Cardiology', order: 2, description: 'Heart and cardiovascular care' },
        { name: 'Neurology', order: 3, description: 'Brain and nervous system' },
        { name: 'Orthopedics', order: 4, description: 'Bones and joints' }
      ]);
      console.log('✅ Default units created');
    } else {
      console.log(`📊 Found ${existingUnits.length} existing units`);
    }

    // Check if interns collection is empty
    const existingInterns = await Intern.find();
    if (existingInterns.length === 0) {
      console.log('🌱 Seeding sample interns...');
      const units = await Unit.find();
      if (units.length > 0) {
        const intern1 = await Intern.create({
          name: 'Alice Johnson',
          startDate: new Date('2026-01-15'),
          status: 'active'
        });
        const intern2 = await Intern.create({
          name: 'Bob Smith',
          startDate: new Date('2026-02-01'),
          status: 'active'
        });

        // Create initial rotations
        const rotation1 = await Rotation.create({
          intern: intern1._id,
          unit: units[0]._id,
          startDate: intern1.startDate,
          endDate: new Date(intern1.startDate.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
          status: 'active'
        });
        const rotation2 = await Rotation.create({
          intern: intern2._id,
          unit: units[1]._id,
          startDate: intern2.startDate,
          endDate: new Date(intern2.startDate.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
          status: 'active'
        });

        // Update interns with currentUnit and rotations
        await Intern.findByIdAndUpdate(intern1._id, {
          currentUnit: units[0]._id,
          rotations: [rotation1._id]
        });
        await Intern.findByIdAndUpdate(intern2._id, {
          currentUnit: units[1]._id,
          rotations: [rotation2._id]
        });

        console.log('✅ Sample interns and rotations created');
      }
    } else {
      console.log(`📊 Found ${existingInterns.length} existing interns`);
    }

  } catch (error) {
    console.error('❌ Seeding error:', error);
    // Don't exit - continue with server startup
  }
}

async function startServer() {
  try {
    // Connect to MongoDB first
    console.log('\n📦 Connecting to MongoDB...');
    await connectDB();
    databaseReady = true;

    // Seed default data if collections are empty
    await seedDefaultData();

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 SPIN Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🧪 Test DB: http://localhost:${PORT}/test-db`);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
      }
    });
    
    // Keep process alive and handle errors gracefully
    app.on('error', (err) => {
      console.error('Express error:', err);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log - keep server running
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately - give it a chance to recover
});

startServer();

