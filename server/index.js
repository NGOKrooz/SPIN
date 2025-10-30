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
  allowedHeaders: ['Content-Type','Authorization','x-admin-key']
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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
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
