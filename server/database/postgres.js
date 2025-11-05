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
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
      console.error('Error during rollback:', rollbackErr);
    }
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
    { name: 'Adult Neurology', duration_days: 2, patient_count: 6 },        // Medium (5-8)
    { name: 'Acute Stroke', duration_days: 2, patient_count: 10 },          // High (>8)
    { name: 'Neurosurgery', duration_days: 2, patient_count: 12 },          // High (>8)
    { name: 'Geriatrics', duration_days: 2, patient_count: 7 },             // Medium (5-8)
    { name: 'Orthopedic Inpatients', duration_days: 2, patient_count: 11 }, // High (>8)
    { name: 'Orthopedic Outpatients', duration_days: 2, patient_count: 6 }, // Medium (5-8)
    { name: 'Electrophysiology', duration_days: 2, patient_count: 3 },      // Low (≤4)
    { name: 'Exercise Immunology', duration_days: 2, patient_count: 2 },    // Low (≤4)
    { name: 'Women\'s Health', duration_days: 2, patient_count: 7 },        // Medium (5-8)
    { name: 'Pediatrics Inpatients', duration_days: 2, patient_count: 10 }, // High (>8)
    { name: 'Pediatrics Outpatients', duration_days: 2, patient_count: 6 }, // Medium (5-8)
    { name: 'Cardio Thoracic Unit', duration_days: 2, patient_count: 12 }   // High (>8)
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

