const { Pool } = require('pg');

// Parse DATABASE_URL or use individual connection parameters
const getConnectionConfig = () => {
  if (process.env.DATABASE_URL) {
    const connectionString = process.env.DATABASE_URL;
    
    // For Railway private networking, SSL is typically not required
    // Check if sslmode is specified in the connection string
    let ssl = false;
    
    try {
      const url = new URL(connectionString);
      const sslMode = url.searchParams.get('sslmode');
      
      // Determine SSL settings based on connection string parameters
      if (sslMode === 'require' || sslMode === 'prefer') {
        ssl = { rejectUnauthorized: false };
      } else if (sslMode === 'disable') {
        ssl = false;
      } else {
        // Default for Railway private networking (no SSL)
        // Private networking connection strings typically use internal hostnames
        // or have no sslmode specified, so we default to no SSL
        // This avoids egress fees and is more efficient for internal connections
        ssl = false;
      }
    } catch (err) {
      // If URL parsing fails, default to no SSL (safe for private networking)
      console.log('Note: Could not parse DATABASE_URL, defaulting to no SSL (safe for Railway private networking)');
      ssl = false;
    }
    
    return {
      connectionString: connectionString,
      ssl: ssl,
    };
  }
  
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'spin',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
};

const pool = new Pool(getConnectionConfig());

// Test connection
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
  process.exit(-1);
});

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
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

    await client.query('COMMIT');
    
    // Add patient_count column if it doesn't exist (migration for existing databases)
    // This needs to be outside the transaction because it might fail
    try {
      await client.query('BEGIN');
      await client.query(`
        ALTER TABLE units ADD COLUMN patient_count INTEGER DEFAULT 0
      `);
      await client.query('COMMIT');
      console.log('Patient count column added');
    } catch (err) {
      // Rollback the transaction if it failed
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // Ignore rollback errors
      }
      
      if (err.message.includes('already exists') || err.code === '42701' || err.message.includes('duplicate column')) {
        console.log('Patient count column already exists');
      } else {
        // Re-throw if it's a different error
        throw err;
      }
    }
    
    // Continue with the rest of table creation in a new transaction
    await client.query('BEGIN');

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

    await client.query('COMMIT');
    
    // Insert default settings
    await insertDefaultSettings();
    await insertDefaultUnits();
    
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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
    { name: 'Adult Neurology', duration_days: 21, workload: 'Medium' },
    { name: 'Acute Stroke', duration_days: 30, workload: 'High' },
    { name: 'Neurosurgery', duration_days: 30, workload: 'High' },
    { name: 'Geriatrics', duration_days: 30, workload: 'Medium' },
    { name: 'Orthopedic Inpatients', duration_days: 30, workload: 'High' },
    { name: 'Orthopedic Outpatients', duration_days: 30, workload: 'Medium' },
    { name: 'Electrophysiology', duration_days: 30, workload: 'Low' },
    { name: 'Exercise Immunology', duration_days: 30, workload: 'Low' },
    { name: 'Women\'s Health', duration_days: 30, workload: 'Medium' },
    { name: 'Pediatrics Inpatients', duration_days: 21, workload: 'High' },
    { name: 'Pediatrics Outpatients', duration_days: 21, workload: 'Medium' },
    { name: 'Cardio Thoracic Unit', duration_days: 30, workload: 'High' }
  ];

  for (const unit of defaultUnits) {
    await pool.query(
      `INSERT INTO units (name, duration_days, workload) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (name) DO NOTHING`,
      [unit.name, unit.duration_days, unit.workload]
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

