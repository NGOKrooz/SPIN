const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: false,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
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

// Extra CORS safety headers for environments behind proxies
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Routes
app.use('/api/interns', require('./routes/interns'));
app.use('/api/units', require('./routes/units'));
app.use('/api/rotations', require('./routes/rotations'));
app.use('/api/reports', require('./routes/reports'));
// Settings route exports helpers alongside the router; mount the router explicitly
app.use('/api/settings', require('./routes/settings').router);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SPIN API is running',
    timestamp: new Date().toISOString()
  });
});

// Serve React build if it exists (works in production containers without NODE_ENV)
const buildPath = path.join(__dirname, '../client/build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));

  // Non-API routes should serve the SPA
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  // 404 handler when no frontend build is present
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Initialize database and start server
const { initializeDatabase } = require('./database/init');

async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`🚀 SPIN Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
