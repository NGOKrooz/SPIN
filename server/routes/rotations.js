const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database/init');
const { addDays, format, parseISO, differenceInDays, startOfWeek, endOfWeek, isWithinInterval } = require('date-fns');
const { isBatchOffOnDate } = require('./settings');

const router = express.Router();
const db = getDatabase();

// Validation middleware
const validateRotation = [
  body('intern_id').isInt().withMessage('Intern ID must be a number'),
  body('unit_id').isInt().withMessage('Unit ID must be a number'),
  body('start_date').isISO8601().withMessage('Start date must be a valid date'),
  body('end_date').isISO8601().withMessage('End date must be a valid date')
];

// Validation middleware for updates (intern_id is optional since we don't change it)
const validateRotationUpdate = [
  body('intern_id').optional().isInt().withMessage('Intern ID must be a number'),
  body('unit_id').isInt().withMessage('Unit ID must be a number'),
  body('start_date').isISO8601().withMessage('Start date must be a valid date'),
  body('end_date').isISO8601().withMessage('End date must be a valid date')
];

// GET /api/rotations - Get all rotations with filters
router.get('/', (req, res) => {
  const { start_date, end_date, unit_id, batch, status } = req.query;
  
  let query = `
    SELECT 
      r.*,
      i.name as intern_name,
      i.batch as intern_batch,
      i.status as intern_status,
      u.name as unit_name,
      u.workload as unit_workload
    FROM rotations r
    JOIN interns i ON r.intern_id = i.id
    JOIN units u ON r.unit_id = u.id
  `;
  
  const conditions = [];
  const params = [];
  
  if (start_date) {
    conditions.push('r.start_date >= ?');
    params.push(start_date);
  }
  
  if (end_date) {
    conditions.push('r.end_date <= ?');
    params.push(end_date);
  }
  
  if (unit_id) {
    conditions.push('r.unit_id = ?');
    params.push(unit_id);
  }
  
  if (batch) {
    conditions.push('i.batch = ?');
    params.push(batch);
  }
  
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY r.start_date, u.name';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching rotations:', err);
      return res.status(500).json({ error: 'Failed to fetch rotations' });
    }
    
    res.json(rows);
  });
});

// GET /api/rotations/current - Get current active rotations
router.get('/current', (req, res) => {
  const query = `
    SELECT 
      r.*,
      i.name as intern_name,
      i.batch as intern_batch,
      i.status as intern_status,
      u.name as unit_name,
      u.workload as unit_workload,
      u.duration_days
    FROM rotations r
    JOIN interns i ON r.intern_id = i.id
    JOIN units u ON r.unit_id = u.id
    WHERE r.start_date <= date('now') AND r.end_date >= date('now')
    ORDER BY u.name, i.batch
  `;
  
  // Get all units to check for units with no rotations
  const allUnitsQuery = `SELECT id, name, workload FROM units`;
  
  db.all(allUnitsQuery, [], (err, allUnits) => {
    if (err) {
      console.error('Error fetching all units:', err);
      return res.status(500).json({ error: 'Failed to fetch units' });
    }
    
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('Error fetching current rotations:', err);
        return res.status(500).json({ error: 'Failed to fetch current rotations' });
      }
      
      // Initialize coverage for all units
      const unitCoverage = {};
      allUnits.forEach(unit => {
        unitCoverage[unit.id] = {
          unit_name: unit.name,
          unit_workload: unit.workload,
          batch_a: [],
          batch_b: [],
          coverage_status: 'good'
        };
      });
      
      // Add rotation data
      rows.forEach(rotation => {
        const unitId = rotation.unit_id;
        if (unitCoverage[unitId]) {
          if (rotation.intern_batch === 'A') {
            unitCoverage[unitId].batch_a.push(rotation);
          } else {
            unitCoverage[unitId].batch_b.push(rotation);
          }
        }
      });
      
      // Analyze coverage status
      Object.values(unitCoverage).forEach(unit => {
        const hasBatchA = unit.batch_a.length > 0;
        const hasBatchB = unit.batch_b.length > 0;
        
        // Units with no interns from both batches require immediate attention - should be critical
        if (!hasBatchA && !hasBatchB) {
          unit.coverage_status = 'critical';
        } else if (unit.unit_workload === 'High' && (!hasBatchA || !hasBatchB)) {
          unit.coverage_status = 'critical';
        } else if (unit.unit_workload === 'Medium' && (!hasBatchA || !hasBatchB)) {
          unit.coverage_status = 'warning';
        }
      });
      
      res.json({
        rotations: rows,
        unit_coverage: unitCoverage
      });
    });
  });
});

// POST /api/rotations - Create manual rotation assignment
router.post('/', validateRotation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { intern_id, unit_id, start_date, end_date, is_manual_assignment = true } = req.body;
  
  // Check for conflicts
  const conflictQuery = `
    SELECT COUNT(*) as count FROM rotations 
    WHERE intern_id = ? 
    AND (
      (start_date <= ? AND end_date >= ?) OR
      (start_date <= ? AND end_date >= ?) OR
      (start_date >= ? AND end_date <= ?)
    )
  `;
  
  db.get(conflictQuery, [intern_id, start_date, start_date, end_date, end_date, start_date, end_date], (err, row) => {
    if (err) {
      console.error('Error checking conflicts:', err);
      return res.status(500).json({ error: 'Failed to check for conflicts' });
    }
    
    if (row.count > 0) {
      return res.status(400).json({ error: 'Intern has conflicting rotation during this period' });
    }
    
    const insertQuery = `
      INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    db.run(insertQuery, [intern_id, unit_id, start_date, end_date, is_manual_assignment], function(err) {
      if (err) {
        console.error('Error creating rotation:', err);
        return res.status(500).json({ error: 'Failed to create rotation' });
      }
      
      res.status(201).json({
        id: this.lastID,
        intern_id,
        unit_id,
        start_date,
        end_date,
        is_manual_assignment
      });
    });
  });
});

// POST /api/rotations/generate - Generate automatic rotations for all interns
router.post('/generate', async (req, res) => {
  try {
    const { start_date } = req.body;
    const rotationStartDate = start_date || format(new Date(), 'yyyy-MM-dd');
    
    // Get all active interns
    const internsQuery = `
      SELECT * FROM interns 
      WHERE status IN ('Active', 'Extended')
      ORDER BY start_date, batch
    `;
    
    const interns = await new Promise((resolve, reject) => {
      db.all(internsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get all units
    const unitsQuery = 'SELECT * FROM units ORDER BY id';
    const units = await new Promise((resolve, reject) => {
      db.all(unitsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get settings
    const settingsQuery = 'SELECT key, value FROM settings';
    const settings = await new Promise((resolve, reject) => {
      db.all(settingsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
      });
    });
    
    const generatedRotations = [];
    
    for (const intern of interns) {
      const internRotations = generateInternRotations(
        intern, 
        units, 
        parseISO(rotationStartDate),
        settings
      );
      generatedRotations.push(...internRotations);
    }
    
    // Clear existing future rotations
    const clearQuery = `
      DELETE FROM rotations 
      WHERE start_date >= ? AND is_manual_assignment = FALSE
    `;
    
    await new Promise((resolve, reject) => {
      db.run(clearQuery, [rotationStartDate], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Insert new rotations
    const insertQuery = `
      INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
      VALUES (?, ?, ?, ?, FALSE)
    `;
    
    for (const rotation of generatedRotations) {
      await new Promise((resolve, reject) => {
        db.run(insertQuery, [
          rotation.intern_id,
          rotation.unit_id,
          rotation.start_date,
          rotation.end_date
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    res.json({
      message: 'Rotations generated successfully',
      count: generatedRotations.length,
      rotations: generatedRotations
    });
    
  } catch (error) {
    console.error('Error generating rotations:', error);
    res.status(500).json({ error: 'Failed to generate rotations' });
  }
});

// PUT /api/rotations/:id - Update rotation
router.put('/:id', validateRotationUpdate, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { intern_id, unit_id, start_date, end_date } = req.body;
  
  // If intern_id is not provided, we only update unit, start_date, and end_date
  let query, params;
  if (intern_id) {
    query = `
      UPDATE rotations 
      SET intern_id = ?, unit_id = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `;
    params = [intern_id, unit_id, start_date, end_date, id];
  } else {
    query = `
      UPDATE rotations 
      SET unit_id = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `;
    params = [unit_id, start_date, end_date, id];
  }
  
  db.run(query, params, function(err) {
    if (err) {
      console.error('Error updating rotation:', err);
      return res.status(500).json({ error: 'Failed to update rotation' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Rotation not found' });
    }
    
    res.json({ message: 'Rotation updated successfully' });
  });
});

// DELETE /api/rotations/:id - Delete rotation
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  const query = 'DELETE FROM rotations WHERE id = ?';
  
  db.run(query, [id], function(err) {
    if (err) {
      console.error('Error deleting rotation:', err);
      return res.status(500).json({ error: 'Failed to delete rotation' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Rotation not found' });
    }
    
    res.json({ message: 'Rotation deleted successfully' });
  });
});

// Helper function to generate rotations for a single intern
function generateInternRotations(intern, units, startDate, settings) {
  const rotations = [];
  const internshipDuration = intern.status === 'Extended' 
    ? 365 + (intern.extension_days || 0) 
    : 365;
  
  let currentDate = parseISO(intern.start_date);
  const endDate = addDays(currentDate, internshipDuration);
  
  // Calculate total rotation days needed (excluding off days)
  const totalRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
  const cycles = Math.ceil(internshipDuration / totalRotationDays);
  
  let rotationIndex = 0;
  
  while (currentDate < endDate && rotationIndex < units.length * cycles) {
    const unitIndex = rotationIndex % units.length;
    const unit = units[unitIndex];
    
    const rotationStart = currentDate;
    let rotationEnd = addDays(rotationStart, unit.duration_days - 1);
    
    // Ensure rotation doesn't exceed internship end date
    const actualEnd = rotationEnd > endDate ? endDate : rotationEnd;
    
    // Adjust rotation dates to account for batch off days
    const adjustedDates = adjustRotationDatesForOffDays(
      rotationStart, 
      actualEnd, 
      intern.batch, 
      settings
    );
    
    rotations.push({
      intern_id: intern.id,
      unit_id: unit.id,
      start_date: format(adjustedDates.start, 'yyyy-MM-dd'),
      end_date: format(adjustedDates.end, 'yyyy-MM-dd')
    });
    
    currentDate = addDays(adjustedDates.end, 1);
    rotationIndex++;
  }
  
  return rotations;
}

// Helper function to adjust rotation dates to account for batch off days
function adjustRotationDatesForOffDays(startDate, endDate, batch, settings) {
  let adjustedStart = startDate;
  let adjustedEnd = endDate;
  
  // Check if rotation starts on an off day and adjust
  if (isBatchOffOnDate(batch, format(startDate, 'yyyy-MM-dd'), settings)) {
    adjustedStart = addDays(startDate, 1);
  }
  
  // Check if rotation ends on an off day and adjust
  if (isBatchOffOnDate(batch, format(endDate, 'yyyy-MM-dd'), settings)) {
    adjustedEnd = addDays(endDate, 1);
  }
  
  // Ensure we don't go backwards
  if (adjustedStart > adjustedEnd) {
    adjustedEnd = adjustedStart;
  }
  
  return {
    start: adjustedStart,
    end: adjustedEnd
  };
}

module.exports = router;
