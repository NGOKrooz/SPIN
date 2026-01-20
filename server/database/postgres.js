const { Pool } = require('pg');
const url = require('url');

// Parse DATABASE_URL or use individual connection parameters
const getConnectionConfig = () => {
  if (process.env.DATABASE_URL) {
    const connectionString = process.env.DATABASE_URL;
    
    console.log('🔧 Parsing DATABASE_URL for PostgreSQL connection...');
    
    try {
      // Parse the connection URL
      const parsedUrl = url.parse(connectionString, true);
      
      // Extract hostname - critical for IPv6/IPv4 resolution
      let hostname = parsedUrl.hostname || 'localhost';
      
      // Extract credentials and database details
      const username = parsedUrl.auth ? parsedUrl.auth.split(':')[0] : 'postgres';
      const password = parsedUrl.auth ? parsedUrl.auth.split(':')[1] : '';
      const port = parsedUrl.port || 5432;
      const database = parsedUrl.pathname ? parsedUrl.pathname.slice(1) : 'postgres';
      
      console.log(`📡 Database host: ${hostname}:${port}`);
      console.log(`📊 Database name: ${database}`);
      console.log(`👤 User: ${username}`);
      
      // Determine SSL settings based on protocol or sslmode parameter
      let ssl = false;
      const sslMode = parsedUrl.query?.sslmode;
      
      // For Supabase and most cloud PostgreSQL providers, SSL is required
      // Only disable if explicitly set to 'disable'
      if (sslMode === 'disable') {
        ssl = false;
        console.log('🔒 SSL: Disabled (per sslmode parameter)');
      } else if (sslMode === 'require' || sslMode === 'prefer') {
        ssl = { rejectUnauthorized: false };
        console.log('🔒 SSL: Enabled (required for Supabase/cloud providers)');
      } else if (hostname.includes('supabase') || hostname.includes('amazonaws') || hostname.includes('azure')) {
        // Auto-detect cloud providers that require SSL
        ssl = { rejectUnauthorized: false };
        console.log('🔒 SSL: Auto-detected as required for cloud provider');
      } else if (process.env.NODE_ENV === 'production') {
        // Default to SSL in production
        ssl = { rejectUnauthorized: false };
        console.log('🔒 SSL: Enabled (production environment)');
      } else {
        ssl = false;
        console.log('🔒 SSL: Disabled (development/local)');
      }
      
      return {
        host: hostname,
        port: port,
        database: database,
        user: username,
        password: password,
        ssl: ssl,
        // Force IPv4 to avoid ENETUNREACH issues with IPv6 resolution
        family: 4,
        // Add connection retry parameters
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
      };
    } catch (err) {
      console.error('❌ Error parsing DATABASE_URL:', err.message);
      console.log('⚠️  Falling back to connection string parsing');
      
      // Fallback: use connection string directly but with IPv4 forcing
      return {
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }, // Default to SSL for Supabase
        family: 4, // Force IPv4
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
      };
    }
  }
  
  // Local database connection (no Supabase)
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'spin',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    family: 4, // Force IPv4 for consistency
  };
};

const pool = new Pool(getConnectionConfig());

let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
const RETRY_DELAY = 5000; // 5 seconds

// Track connection state
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected successfully');
  connectionAttempts = 0; // Reset on successful connection
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err.message);
  
  // Log additional diagnostic information
  if (err.code === 'ENETUNREACH') {
    console.error('📡 Network unreachable - likely IPv6/IPv4 resolution issue');
    console.error('   The server is trying to connect to an IPv6 address but IPv6 is not available');
    console.error('   Fix: Ensure family: 4 is set to force IPv4 resolution');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('🚫 Connection refused - PostgreSQL server not responding');
  } else if (err.code === 'ENOTFOUND') {
    console.error('🔍 Hostname not found - check DATABASE_URL is correct');
  }
  
  connectionAttempts++;
  
  // Only exit if we've exhausted retry attempts and this is a fatal error
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS && process.env.NODE_ENV === 'production') {
    console.error(`❌ Failed to connect after ${MAX_CONNECTION_ATTEMPTS} attempts. Exiting.`);
    // Don't exit immediately - let other endpoints serve
  }
  // In development or for transient errors, keep the process alive
});

// Handle pool errors gracefully
pool.on('error', (err, client) => {
  if (client) {
    console.error('Unexpected error on idle client', err);
  }
});

// Attempt to reconnect if connection fails
const attemptConnection = async (delay = 0) => {
  if (delay > 0) {
    console.log(`⏳ Retrying database connection in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Connection retry failed:', err.message);
    return false;
  }
};

// Initialize database tables
async function initializeDatabase() {
  let client;
  try {
    console.log('🔌 Attempting to connect to PostgreSQL...');
    
    // Try to get a connection with multiple attempts
    let connected = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        client = await pool.connect();
        connected = true;
        console.log(`✅ Connected on attempt ${attempt}`);
        break;
      } catch (err) {
        console.error(`❌ Connection attempt ${attempt} failed: ${err.message}`);
        if (attempt < 3) {
          console.log(`⏳ Waiting ${attempt * 2} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        } else {
          throw err;
        }
      }
    }
    
    if (!connected) {
      throw new Error('Failed to establish database connection after 3 attempts');
    }
    
    await client.query('BEGIN');
    
    // Interns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS interns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
        batch TEXT NOT NULL CHECK (batch IN ('A', 'B')),
        start_date DATE NOT NULL,
        phone_number TEXT,
        status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Extended', 'Completed')),
        extension_days INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Units table
    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        duration_days INTEGER NOT NULL,
        workload TEXT NOT NULL DEFAULT 'Medium' CHECK (workload IN ('Low', 'Medium', 'High')),
        patient_count INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add patient_count column if it doesn't exist (migration for existing databases)
    // Check if column exists first to avoid transaction errors
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'units' AND column_name = 'patient_count'
    `);
    
    if (columnCheck.rows.length === 0) {
      try {
        await client.query(`
          ALTER TABLE units ADD COLUMN patient_count INTEGER DEFAULT 0
        `);
        console.log('Patient count column added');
      } catch (err) {
        console.error('Error adding patient_count column:', err);
        await client.query('ROLLBACK');
        throw err;
      }
    } else {
      console.log('Patient count column already exists');
    }

    // Add is_manual_assignment column to rotations if it doesn't exist (migration for existing databases)
    const manualColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'rotations' AND column_name = 'is_manual_assignment'
    `);
    
    if (manualColumnCheck.rows.length === 0) {
      try {
        await client.query(`
          ALTER TABLE rotations ADD COLUMN is_manual_assignment BOOLEAN DEFAULT FALSE
        `);
        console.log('is_manual_assignment column added');
      } catch (err) {
        console.error('Error adding is_manual_assignment column:', err);
        await client.query('ROLLBACK');
        throw err;
      }
    } else {
      console.log('is_manual_assignment column already exists');
    }

    // Rotations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rotations (
        id SERIAL PRIMARY KEY,
        intern_id INTEGER NOT NULL,
        unit_id INTEGER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_manual_assignment BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE
      )
    `);

    // Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Workload history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workload_history (
        id SERIAL PRIMARY KEY,
        unit_id INTEGER NOT NULL,
        workload TEXT NOT NULL CHECK (workload IN ('Low', 'Medium', 'High')),
        week_start_date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE
      )
    `);

    // Extension reasons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS extension_reasons (
        id SERIAL PRIMARY KEY,
        intern_id INTEGER NOT NULL,
        extension_days INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('sign out', 'presentation', 'internal query', 'leave', 'other')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE CASCADE
      )
    `);

    // Activity log table for recent updates
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        activity_type TEXT NOT NULL CHECK (activity_type IN ('extension', 'reassignment', 'unit_change', 'status_change', 'new_intern', 'auto_advance', 'rotation_update')),
        intern_id INTEGER,
        intern_name TEXT,
        unit_id INTEGER,
        unit_name TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE SET NULL,
        FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE SET NULL
      )
    `);

    await client.query('COMMIT');
    
    // Insert default settings and units outside of transaction
    await insertDefaultSettings();
    await insertDefaultUnits();
    
    // Set all unit durations to 2 days
    try {
      const unitsResult = await client.query('SELECT id, name, duration_days FROM units');
      if (unitsResult.rows && unitsResult.rows.length > 0) {
        for (const unit of unitsResult.rows) {
          await client.query('UPDATE units SET duration_days = $1 WHERE id = $2', [2, unit.id]);
        }
        console.log(`✅ Set all ${unitsResult.rows.length} unit(s) to 2 days duration`);
      }
    } catch (err) {
      console.error('Error setting unit durations to 2 days:', err);
      // Don't fail initialization if this fails
    }
    
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    
    // Attempt rollback if connection is still valid
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('⚠️  Rollback error (may be expected):', rollbackErr.message);
      }
    }
    
    // Re-throw with context but don't kill the process
    // Server should continue running to serve the health check endpoint
    const error = new Error(`Database initialization failed: ${err.message}`);
    error.originalError = err;
    throw error;
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseErr) {
        console.error('⚠️  Error releasing client:', releaseErr.message);
      }
    }
  }
}

async function insertDefaultSettings() {
  const defaultSettings = [
    { key: 'batch_a_off_day_week1', value: 'Monday', description: 'Day of the week when Batch A is off in weeks 1&2' },
    { key: 'batch_b_off_day_week1', value: 'Wednesday', description: 'Day of the week when Batch B is off in weeks 1&2' },
    { key: 'batch_a_off_day_week3', value: 'Wednesday', description: 'Day of the week when Batch A is off in weeks 3&4' },
    { key: 'batch_b_off_day_week3', value: 'Monday', description: 'Day of the week when Batch B is off in weeks 3&4' },
    { key: 'schedule_start_date', value: '2024-01-01', description: 'Reference date for calculating alternating schedule weeks' },
    { key: 'internship_duration_months', value: '12', description: 'Total internship duration in months' },
    { key: 'rotation_buffer_days', value: '2', description: 'Buffer days between rotations' }
  ];

  for (const setting of defaultSettings) {
    await pool.query(
      `INSERT INTO settings (key, value, description) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (key) DO NOTHING`,
      [setting.key, setting.value, setting.description]
    );
  }
}

async function insertDefaultUnits() {
  const defaultUnits = [
    { name: 'Adult Neurology', duration_days: 2, patient_count: 0 },
    { name: 'Acute Stroke', duration_days: 2, patient_count: 0 },
    { name: 'Neurosurgery', duration_days: 2, patient_count: 0 },
    { name: 'Geriatrics', duration_days: 2, patient_count: 0 },
    { name: 'Orthopedic Inpatients', duration_days: 2, patient_count: 0 },
    { name: 'Orthopedic Outpatients', duration_days: 2, patient_count: 0 },
    { name: 'Electrophysiology', duration_days: 2, patient_count: 0 },
    { name: 'Exercise Immunology', duration_days: 2, patient_count: 0 },
    { name: 'Women\'s Health', duration_days: 2, patient_count: 0 },
    { name: 'Pediatrics Inpatients', duration_days: 2, patient_count: 0 },
    { name: 'Pediatrics Outpatients', duration_days: 2, patient_count: 0 },
    { name: 'Cardio Thoracic Unit', duration_days: 2, patient_count: 0 }
  ];

  for (const unit of defaultUnits) {
    // Calculate workload from patient_count
    let workload;
    if (unit.patient_count <= 4) workload = 'Low';
    else if (unit.patient_count <= 8) workload = 'Medium';
    else workload = 'High';
    
    await pool.query(
      `INSERT INTO units (name, duration_days, patient_count, workload) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (name) DO NOTHING`,
      [unit.name, unit.duration_days, unit.patient_count, workload]
    );
  }
}

// Get database pool (for queries)
function getDatabase() {
  return pool;
}

module.exports = {
  initializeDatabase,
  getDatabase
};

