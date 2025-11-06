// Debug endpoints for troubleshooting
const express = require('express');
const db = require('../database/dbWrapper');
const router = express.Router();

// GET /api/debug/env - Check environment variables
router.get('/env', (req, res) => {
  res.json({
    AUTO_ROTATION: process.env.AUTO_ROTATION,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    hasDatabaseUrl: !!process.env.DATABASE_URL
  });
});

// GET /api/debug/interns - Check interns in database
router.get('/interns', (req, res) => {
  db.all('SELECT id, name, status, start_date, batch FROM interns', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      count: rows.length,
      interns: rows
    });
  });
});

// GET /api/debug/units - Check units in database
router.get('/units', (req, res) => {
  db.all('SELECT id, name, duration_days FROM units', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      count: rows.length,
      units: rows
    });
  });
});

// GET /api/debug/rotations - Check rotations in database
router.get('/rotations', (req, res) => {
  db.all(`
    SELECT 
      r.id, 
      r.intern_id, 
      r.unit_id, 
      r.start_date, 
      r.end_date, 
      r.is_manual_assignment,
      i.name as intern_name,
      u.name as unit_name
    FROM rotations r
    LEFT JOIN interns i ON r.intern_id = i.id
    LEFT JOIN units u ON r.unit_id = u.id
    ORDER BY r.start_date DESC
    LIMIT 50
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      count: rows.length,
      rotations: rows
    });
  });
});

// GET /api/debug/rotations/:internId - Check specific intern's rotations
router.get('/rotations/:internId', (req, res) => {
  const { internId } = req.params;
  
  db.all(`
    SELECT 
      r.*,
      u.name as unit_name,
      u.duration_days
    FROM rotations r
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE r.intern_id = ?
    ORDER BY r.start_date ASC
  `, [internId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const today = new Date().toISOString().split('T')[0];
    res.json({
      internId,
      today,
      count: rows.length,
      rotations: rows,
      upcoming: rows.filter(r => r.start_date > today),
      current: rows.filter(r => r.start_date <= today && r.end_date >= today),
      past: rows.filter(r => r.end_date < today)
    });
  });
});

module.exports = router;

