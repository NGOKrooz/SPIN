// Determine database type based on environment
const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : (process.env.DB_TYPE || 'sqlite');

let db, initializeDatabase, getDatabase;

if (DB_TYPE === 'postgres') {
  // Use PostgreSQL
  const postgres = require('./postgres');
  initializeDatabase = postgres.initializeDatabase;
  getDatabase = postgres.getDatabase;
  db = getDatabase();
  module.exports = { initializeDatabase, getDatabase };
} else {
  // Use SQLite (existing code)
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const fs = require('fs');

  const DB_PATH = process.env.DB_PATH || './database/spin.db';

  // Ensure database directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.Database(DB_PATH);

  // Initialize database tables
  initializeDatabase = function() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Interns table
      db.run(`
        CREATE TABLE IF NOT EXISTS interns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
          batch TEXT NOT NULL CHECK (batch IN ('A', 'B')),
          start_date DATE NOT NULL,
          phone_number TEXT,
          status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Extended', 'Completed')),
          extension_days INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Units table
      db.run(`
        CREATE TABLE IF NOT EXISTS units (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          duration_days INTEGER NOT NULL,
          workload TEXT NOT NULL DEFAULT 'Medium' CHECK (workload IN ('Low', 'Medium', 'High')),
          patient_count INTEGER DEFAULT 0,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add patient_count column if it doesn't exist (migration for existing databases)
      db.run(`
        ALTER TABLE units ADD COLUMN patient_count INTEGER DEFAULT 0
      `, (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding patient_count column:', err);
        } else {
          console.log('Patient count column added or already exists');
        }
      });

      // Add sort_order column if it doesn't exist (for editable unit ordering)
      db.run(`
        ALTER TABLE units ADD COLUMN sort_order INTEGER DEFAULT NULL
      `, (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding sort_order column:', err);
        } else {
          console.log('sort_order column added or already exists');
        }
      });

      // Add is_manual_assignment column to rotations if it doesn't exist (migration for existing databases)
      db.run(`
        ALTER TABLE rotations ADD COLUMN is_manual_assignment BOOLEAN DEFAULT FALSE
      `, (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding is_manual_assignment column:', err);
        } else {
          console.log('is_manual_assignment column added or already exists');
        }
      });

      // Rotations table
      db.run(`
        CREATE TABLE IF NOT EXISTS rotations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          intern_id INTEGER NOT NULL,
          unit_id INTEGER NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_manual_assignment BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE CASCADE,
          FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE
        )
      `);

      // Settings table
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Workload history table
      db.run(`
        CREATE TABLE IF NOT EXISTS workload_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          unit_id INTEGER NOT NULL,
          workload TEXT NOT NULL CHECK (workload IN ('Low', 'Medium', 'High')),
          week_start_date DATE NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE CASCADE
        )
      `);

      // Extension reasons table
      db.run(`
        CREATE TABLE IF NOT EXISTS extension_reasons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          intern_id INTEGER NOT NULL,
          extension_days INTEGER NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('sign out', 'presentation', 'internal query', 'leave', 'other')),
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Error creating extension_reasons table:', err);
        }
      });

      // Activity log table for recent updates
      db.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          activity_type TEXT NOT NULL CHECK (activity_type IN ('extension', 'reassignment', 'unit_change', 'status_change', 'new_intern', 'auto_advance', 'rotation_update')),
          intern_id INTEGER,
          intern_name TEXT,
          unit_id INTEGER,
          unit_name TEXT,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (intern_id) REFERENCES interns (id) ON DELETE SET NULL,
          FOREIGN KEY (unit_id) REFERENCES units (id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          // Insert default settings
          insertDefaultSettings()
            .then(() => insertDefaultUnits())
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  });
}

function insertDefaultSettings() {
  return new Promise((resolve, reject) => {
    const defaultSettings = [
      { key: 'batch_a_off_day_week1', value: 'Monday', description: 'Day of the week when Batch A is off in weeks 1&2' },
      { key: 'batch_b_off_day_week1', value: 'Wednesday', description: 'Day of the week when Batch B is off in weeks 1&2' },
      { key: 'batch_a_off_day_week3', value: 'Wednesday', description: 'Day of the week when Batch A is off in weeks 3&4' },
      { key: 'batch_b_off_day_week3', value: 'Monday', description: 'Day of the week when Batch B is off in weeks 3&4' },
      { key: 'schedule_start_date', value: '2024-01-01', description: 'Reference date for calculating alternating schedule weeks' },
      { key: 'internship_duration_months', value: '12', description: 'Total internship duration in months' },
      { key: 'rotation_buffer_days', value: '2', description: 'Buffer days between rotations' },
      { key: 'auto_generation', value: JSON.stringify({ auto_generate_on_create: true, auto_extend_on_extension: true, allow_overlap: false, conflict_resolution_mode: 'strict', auto_resolve_conflicts: false, notify_on_conflicts: true }), description: 'Auto-generation settings for automatic rotation creation' }
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, description) 
      VALUES (?, ?, ?)
    `);

    defaultSettings.forEach(setting => {
      stmt.run(setting.key, setting.value, setting.description);
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function insertDefaultUnits() {
  return new Promise((resolve, reject) => {
    // Updated canonical unit list in correct order with sort_order assigned
    const defaultUnits = [
      { name: 'Exercise Immunology', duration_days: 2, patient_count: 0, sort_order: 1 },
      { name: 'Intensive Care Unit', duration_days: 2, patient_count: 0, sort_order: 2 },
      { name: 'Pelvic and Women\'s Health', duration_days: 2, patient_count: 0, sort_order: 3 },
      { name: 'Neurosurgery', duration_days: 2, patient_count: 0, sort_order: 4 },
      { name: 'Adult Neurology', duration_days: 2, patient_count: 0, sort_order: 5 },
      { name: 'Medicine and Acute Care', duration_days: 2, patient_count: 0, sort_order: 6 },
      { name: 'Geriatric and Mental Health', duration_days: 2, patient_count: 0, sort_order: 7 },
      { name: 'Electrophysiology', duration_days: 2, patient_count: 0, sort_order: 8 },
      { name: 'Orthopedic Out-Patient', duration_days: 2, patient_count: 0, sort_order: 9 },
      { name: 'Orthopedic In-Patient', duration_days: 2, patient_count: 0, sort_order: 10 },
      { name: 'Pediatric-In', duration_days: 2, patient_count: 0, sort_order: 11 },
      { name: 'Pediatric-Out (NDT)', duration_days: 2, patient_count: 0, sort_order: 12 }
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO units (name, duration_days, patient_count, workload, sort_order) 
      VALUES (?, ?, ?, ?, ?)
    `);

    defaultUnits.forEach(unit => {
      // Calculate workload from patient_count
      let workload;
      if (unit.patient_count <= 4) workload = 'Low';
      else if (unit.patient_count <= 8) workload = 'Medium';
      else workload = 'High';
      
      stmt.run(unit.name, unit.duration_days, unit.patient_count, workload, unit.sort_order);
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

  // Get database instance
  getDatabase = function() {
    return db;
  };

  module.exports = {
    initializeDatabase,
    getDatabase
  };
}
