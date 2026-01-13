const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Default autorotation to true if not defined
const autoRotation = process.env.AUTO_ROTATION
  ? process.env.AUTO_ROTATION === 'true'
  : true;

console.log('🌀 Autorotation status:', autoRotation);

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
app.get('/api/health', async (req, res) => {
  const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : (process.env.DB_TYPE || 'sqlite');
  const health = {
    status: 'OK',
    message: 'SPIN API is running',
    timestamp: new Date().toISOString(),
    database: {
      type: DB_TYPE,
      ok: null,
      details: null
    }
  };

  // Try a lightweight DB check
  try {
    const { getDatabase } = require('./database/init');
    const db = getDatabase();

    if (DB_TYPE === 'postgres') {
      // pg Pool has query method
      await db.query('SELECT 1');
      health.database.ok = true;
      try {
        // Log hostname/port if possible
        if (process.env.DATABASE_URL) {
          const url = new URL(process.env.DATABASE_URL);
          health.database.details = { host: url.hostname, port: url.port || '5432' };
        } else {
          health.database.details = { host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || '5432' };
        }
      } catch (e) {
        health.database.details = 'Could not parse DB host details';
      }
    } else {
      // sqlite3 Database object
      await new Promise((resolve, reject) => {
        db.get('SELECT 1 as ok', [], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
      health.database.ok = true;
      health.database.details = { path: process.env.DB_PATH || './database/spin.db' };
    }
  } catch (err) {
    console.error('Health check DB error:', err?.message || err);
    health.database.ok = false;
    health.database.details = err?.message || String(err);
  }

  res.json(health);
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
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/settings', require('./routes/settings').router);
  app.use('/api/config', require('./routes/config'));
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
  console.error('Error middleware caught:', err.stack || err);
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Initialize database and start server
const { initializeDatabase } = require('./database/init');
const scheduler = require('./services/scheduler');
const autoRestore = require('./services/autoRestore');

async function startServer() {
  try {
    // If using PostgreSQL (DATABASE_URL), ensure DB initializes before starting server
    const usingPostgres = !!process.env.DATABASE_URL;

    if (usingPostgres) {
      console.log('🔌 DATABASE_URL detected - verifying DB connectivity before starting server');
      try {
        await initializeDatabase();
        console.log('✅ Database initialized successfully (Postgres)');
      } catch (dbError) {
        console.error('❌ Database initialization failed - aborting startup:', dbError?.message || dbError);
        process.exit(1);
      }
      // Start server after DB is ready
      const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 SPIN Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      });
    } else {
      // Start server first, then initialize database (non-blocking) for SQLite/local dev
      const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 SPIN Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      });

      // Initialize database (non-blocking - server already started)
      try {
        await initializeDatabase();
        console.log('✅ Database initialized successfully');
      } catch (dbError) {
        console.error('❌ Database initialization failed:', dbError);
        // Don't exit - server is already running, health check should still work
      }
    }
    
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
    
    // Initialize database (non-blocking - server already started)
    try {
      await initializeDatabase();
      console.log('✅ Database initialized successfully');
    } catch (dbError) {
      console.error('❌ Database initialization failed:', dbError);
      // Don't exit - server is already running, health check should still work
    }
    
    // Initialize backup scheduler
    if (process.env.BACKUP_SCHEDULE && process.env.BACKUP_SCHEDULE !== 'disabled') {
      try {
        scheduler.initializeScheduler();
        console.log('✅ Backup scheduler initialized');
      } catch (schedulerError) {
        console.error('⚠️  Backup scheduler initialization failed:', schedulerError);
      }
    }
    
    // Perform auto-restore if needed (on fresh deployment)
    if (process.env.AUTO_RESTORE_ENABLED !== 'false') {
      setTimeout(async () => {
        try {
          const restoreResult = await autoRestore.performAutoRestore();
          if (restoreResult.performed) {
            console.log(`✅ Auto-restore completed: ${restoreResult.backupFile}`);
          } else {
            console.log(`ℹ️  Auto-restore skipped: ${restoreResult.reason || 'No action needed'}`);
          }
        } catch (error) {
          console.error('⚠️  Auto-restore error:', error.message);
        }
      }, 2000); // Wait 2 seconds after server start
    }
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

// Export autoRotation for use in other modules
module.exports = { autoRotation };
