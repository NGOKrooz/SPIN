const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database/spin.db';

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Initialize database tables
function initializeDatabase() {
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
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
      { key: 'batch_a_off_day', value: 'Monday', description: 'Day of the week when Batch A is off' },
      { key: 'batch_b_off_day', value: 'Wednesday', description: 'Day of the week when Batch B is off' },
      { key: 'internship_duration_months', value: '12', description: 'Total internship duration in months' },
      { key: 'rotation_buffer_days', value: '2', description: 'Buffer days between rotations' }
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

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO units (name, duration_days, workload) 
      VALUES (?, ?, ?)
    `);

    defaultUnits.forEach(unit => {
      stmt.run(unit.name, unit.duration_days, unit.workload);
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Get database instance
function getDatabase() {
  return db;
}

module.exports = {
  initializeDatabase,
  getDatabase
};
