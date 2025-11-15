const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');
const { addDays, format, parseISO, differenceInDays } = require('date-fns');

const router = express.Router();

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
router.get('/current', async (req, res) => {
  // Auto-advance rotations if enabled
  const autoRotationEnabled = process.env.AUTO_ROTATION === 'true';
  if (autoRotationEnabled) {
    try {
      await autoAdvanceRotations();
    } catch (err) {
      console.error('Error auto-advancing rotations:', err);
      // Continue even if auto-advance fails
    }
  }

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

// POST /api/rotations/auto-advance - Manually trigger auto-advance for rotations
router.post('/auto-advance', async (req, res) => {
  try {
    const result = await autoAdvanceRotations();
    res.json({
      message: 'Auto-advance completed',
      ...result
    });
  } catch (err) {
    console.error('Error auto-advancing rotations:', err);
    res.status(500).json({ error: 'Failed to auto-advance rotations' });
  }
});

// POST /api/rotations/fix-end-dates - Fix all rotation end dates based on unit durations
router.post('/fix-end-dates', async (req, res) => {
  try {
    // Get all rotations with their unit durations
    const rotations = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          r.id,
          r.start_date,
          r.end_date,
          r.unit_id,
          u.duration_days,
          u.name as unit_name
        FROM rotations r
        JOIN units u ON r.unit_id = u.id
        ORDER BY r.id
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    let fixed = 0;
    let skipped = 0;

    for (const rotation of rotations) {
      // Calculate correct end date: start_date + (duration_days - 1)
      const startDate = parseISO(rotation.start_date);
      const correctEndDate = addDays(startDate, rotation.duration_days - 1);
      const correctEndDateStr = format(correctEndDate, 'yyyy-MM-dd');

      // Check if end date needs fixing
      if (rotation.end_date !== correctEndDateStr) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE rotations SET end_date = ? WHERE id = ?',
            [correctEndDateStr, rotation.id],
            function(err) {
              if (err) reject(err);
              else {
                fixed++;
                resolve();
              }
            }
          );
        });
      } else {
        skipped++;
      }
    }

    res.json({
      message: `Fixed ${fixed} rotation(s), ${skipped} already correct`,
      fixed,
      skipped,
      total: rotations.length
    });
  } catch (err) {
    console.error('Error fixing rotation end dates:', err);
    res.status(500).json({ error: 'Failed to fix rotation end dates' });
  }
});

// POST /api/rotations/generate - Generate automatic rotations for all interns
router.post('/generate', async (req, res) => {
  try {
    const { start_date } = req.body;
    const rotationStartDate = start_date || format(new Date(), 'yyyy-MM-dd');
    
    // Get all active interns - order by id for consistent round-robin indexing
    const internsQuery = `
      SELECT * FROM interns 
      WHERE status IN ('Active', 'Extended')
      ORDER BY id ASC
    `;
    
    const interns = await new Promise((resolve, reject) => {
      db.all(internsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get all intern ids (including completed) to maintain global round-robin order
    const internIdsQuery = 'SELECT id FROM interns ORDER BY id ASC';
    const allInternsOrdered = await new Promise((resolve, reject) => {
      db.all(internIdsQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Get all units - order by id for consistent round-robin sequence
    const unitsQuery = 'SELECT * FROM units ORDER BY id ASC';
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
    let roundRobinCounter = await getRoundRobinCounter();
    
    // Round-robin: Each intern gets a different starting unit based on their index
    // Intern 0 starts at Unit 0, Intern 1 starts at Unit 1, etc.
    // When all units are used, it cycles back to Unit 0
    for (const intern of interns) {
      if (units.length === 0) continue;
      const internIndex = roundRobinCounter % units.length;
      roundRobinCounter++;
      const internRotations = generateInternRotations(
        intern, 
        units, 
        parseISO(rotationStartDate),
        settings,
        internIndex  // Pass intern index for offset calculation
      );
      generatedRotations.push(...internRotations);
    }
    
    await setRoundRobinCounter(roundRobinCounter);
    
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

// Helper function to get the next unit for an intern using flexible, fair round-robin logic
// Ensures each intern starts at a different unit and cycles through units fairly
async function getNextUnitForIntern(internId, units, interns, lastRotation) {
  if (!units.length) return null;

  const unitCount = units.length;

  // When there is no previous rotation, use the persistent round-robin counter
  if (!lastRotation) {
    try {
      const currentOffset = await getRoundRobinCounter();
      const nextUnitIndex = currentOffset % unitCount;
      await setRoundRobinCounter(currentOffset + 1);
      return units[nextUnitIndex];
    } catch (err) {
      console.error('[getNextUnitForIntern] Failed to use round robin counter:', err);
      // Fall through to legacy intern-index offset logic if counter fails
      const internIndex = interns.findIndex(i => i.id === internId);
      const baseOffset = internIndex >= 0 ? internIndex % unitCount : 0;
      return units[baseOffset];
    }
  }

  // There is an existing rotation; continue to the next unit in sequence
  const lastUnitIndex = units.findIndex(u => u.id === lastRotation.unit_id);
  if (lastUnitIndex === -1) {
    // Last unit no longer exists – fall back to round-robin counter
    const currentOffset = await getRoundRobinCounter();
    const nextUnitIndex = currentOffset % unitCount;
    await setRoundRobinCounter(currentOffset + 1);
    return units[nextUnitIndex];
  }

  const nextUnitIndex = (lastUnitIndex + 1) % unitCount;
  return units[nextUnitIndex];
}

async function getRoundRobinCounter() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT value FROM settings WHERE key = 'round_robin_offset'`,
      [],
      (err, row) => {
        if (err) return reject(err);
        const value = row && row.value !== undefined ? parseInt(row.value, 10) : 0;
        resolve(Number.isFinite(value) ? value : 0);
      }
    );
  });
}

async function setRoundRobinCounter(value) {
  const counterValue = String(value);
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT key FROM settings WHERE key = 'round_robin_offset'`,
      [],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          db.run(
            `UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'round_robin_offset'`,
            [counterValue],
            function(updateErr) {
              if (updateErr) reject(updateErr);
              else resolve();
            }
          );
        } else {
          db.run(
            `INSERT INTO settings (key, value, description, updated_at) VALUES ('round_robin_offset', ?, 'Tracks next starting unit for round-robin', CURRENT_TIMESTAMP)`,
            [counterValue],
            function(insertErr) {
              if (insertErr) reject(insertErr);
              else resolve();
            }
          );
        }
      }
    );
  });
}

// Helper function to automatically advance interns to their next rotation
// Only works with automatic rotations (is_manual_assignment = FALSE)
// Always ensures there's an upcoming rotation visible
async function autoAdvanceRotations() {
  // Use UTC date to avoid timezone issues in production
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  let today;
  try {
    today = format(todayUTC, 'yyyy-MM-dd');
  } catch (err) {
    console.error('[AutoAdvance] Error formatting today date:', err);
    return { advanced: 0, skipped: 0, errors: 1 };
  }
  
  const todayDate = parseISO(today);
  
  // Get all units in order (rotation sequence)
  const units = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM units ORDER BY id', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  // Get all interns (including completed) to maintain consistent round-robin order
  const allInternsOrdered = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id FROM interns ORDER BY id`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  if (units.length === 0) {
    return { advanced: 0, skipped: 0, errors: 0 };
  }
  
  // Get all active interns (ordered consistently for index calculation)
  const interns = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM interns WHERE status IN ('Active', 'Extended') ORDER BY id`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
  
  let advanced = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let internIndex = 0; internIndex < interns.length; internIndex++) {
    const intern = interns[internIndex];
    try {
      // Validate intern has valid start_date
      if (!intern.start_date) {
        console.error(`[AutoAdvance] Intern ${intern.id} (${intern.name}): Missing start_date, skipping`);
        errors++;
        continue;
      }
      
      let internStartDate;
      try {
        internStartDate = parseISO(intern.start_date);
        if (isNaN(internStartDate.getTime())) {
          console.error(`[AutoAdvance] Intern ${intern.id} (${intern.name}): Invalid start_date "${intern.start_date}", skipping`);
          errors++;
          continue;
        }
      } catch (err) {
        console.error(`[AutoAdvance] Intern ${intern.id} (${intern.name}): Error parsing start_date "${intern.start_date}":`, err);
        errors++;
        continue;
      }
      
      // Get ALL rotations for this intern (both manual and automatic) to find the last one
      const allRotationsHistory = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM rotations 
           WHERE intern_id = ?
           ORDER BY start_date ASC`,
          [intern.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      // Get all automatic rotations to check for existing upcoming ones
      const automaticRotations = allRotationsHistory.filter(r => !r.is_manual_assignment);
      
      // Get the last rotation (ordered by end_date DESC to get the most recent)
      const lastRotationQuery = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM rotations 
           WHERE intern_id = ?
           ORDER BY end_date DESC
           LIMIT 1`,
          [intern.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
      
      const lastRotation = lastRotationQuery;
      
      if (allRotationsHistory.length === 0) {
        // No rotations yet, skip (should be handled by initial generation)
        console.log(`[AutoAdvance] Intern ${intern.id} (${intern.name}): No rotations yet, skipping`);
        skipped++;
        continue;
      }
      
      // Validate last rotation has valid end_date (if it exists)
      let lastEndDate;
      if (lastRotation) {
        if (!lastRotation.end_date) {
          console.error(`[AutoAdvance] Intern ${intern.id}: Last rotation has no end_date, skipping`);
          errors++;
          continue;
        }
        
        try {
          lastEndDate = parseISO(lastRotation.end_date);
          if (isNaN(lastEndDate.getTime())) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Invalid end_date "${lastRotation.end_date}", skipping`);
            errors++;
            continue;
          }
        } catch (err) {
          console.error(`[AutoAdvance] Intern ${intern.id}: Error parsing end_date "${lastRotation.end_date}":`, err);
          errors++;
          continue;
        }
      } else {
        // No last rotation found, use intern's start date
        lastEndDate = internStartDate;
      }
      
      // Check if there's an upcoming automatic rotation (start_date > today)
      const upcomingAutomaticRotations = automaticRotations.filter(r => {
        try {
          if (!r.start_date) return false;
          // Use string comparison to avoid timezone issues
          const rotationStartStr = r.start_date ? r.start_date.split('T')[0] : r.start_date;
          return rotationStartStr > today;
        } catch (err) {
          console.error(`Error parsing rotation start date for rotation ${r.id}:`, err);
          return false;
        }
      });
      
      // Calculate where next rotation should start (day after last rotation ends)
      let nextStartDate;
      try {
        nextStartDate = addDays(lastEndDate, 1);
        if (isNaN(nextStartDate.getTime())) {
          console.error(`[AutoAdvance] Intern ${intern.id}: Invalid nextStartDate calculated, skipping`);
          errors++;
          continue;
        }
      } catch (err) {
        console.error(`[AutoAdvance] Intern ${intern.id}: Error calculating nextStartDate:`, err);
        errors++;
        continue;
      }
      
      // Check if we need to generate upcoming automatic rotations
      // We want at least one upcoming automatic rotation (starting after today)
      let rotationsToCreate = 0;
      
      if (upcomingAutomaticRotations.length === 0) {
        // No upcoming automatic rotations, need to create at least one
        rotationsToCreate = 1;
      } else {
        // Check if the upcoming automatic rotations cover until after the last rotation ends
        if (upcomingAutomaticRotations.length > 0) {
          try {
            const lastUpcoming = upcomingAutomaticRotations[upcomingAutomaticRotations.length - 1];
            if (!lastUpcoming.end_date) {
              rotationsToCreate = 1;
            } else {
              const lastUpcomingEndDate = parseISO(lastUpcoming.end_date);
              if (isNaN(lastUpcomingEndDate.getTime()) || lastUpcomingEndDate <= lastEndDate) {
                // Upcoming rotations don't go far enough, need more
                rotationsToCreate = 1;
              }
            }
          } catch (err) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Error comparing upcoming rotations:`, err);
            rotationsToCreate = 1;
          }
        }
      }
      
      // Check if intern has completed all units AND has no active/upcoming rotations
      const completedUnits = new Set(automaticRotations.map(r => r.unit_id));
      
      // Check for current or upcoming rotations (intern is still active)
      const hasActiveOrUpcomingRotations = allRotationsHistory.some(r => {
        if (!r.start_date || !r.end_date) return false;
        try {
          const startDate = parseISO(r.start_date);
          const endDate = parseISO(r.end_date);
          if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
          
          const startStr = format(startDate, 'yyyy-MM-dd');
          const endStr = format(endDate, 'yyyy-MM-dd');
          
          // Current rotation (today is between start and end)
          if (startStr <= today && endStr >= today) return true;
          
          // Upcoming rotation (start date is after today)
          if (startStr > today) return true;
          
          return false;
        } catch (err) {
          return false;
        }
      });
      
      // Only mark as Completed if:
      // 1. All units are completed
      // 2. No active or upcoming rotations (internship is truly finished)
      if (completedUnits.size >= units.length && !hasActiveOrUpcomingRotations) {
        console.log(`[AutoAdvance] Intern ${intern.id} has completed all ${units.length} units and has no active/upcoming rotations`);
        
        // Mark intern as Completed only if status isn't already Extended
        if (intern.status !== 'Extended') {
          try {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE interns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['Completed', intern.id],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            console.log(`[AutoAdvance] Intern ${intern.id} (${intern.name}) marked as Completed`);
          } catch (err) {
            console.error(`[AutoAdvance] Error marking intern ${intern.id} as Completed:`, err);
          }
        }
        
        skipped++;
        continue; // Skip creating new rotations
      }
      
      // If intern has active/upcoming rotations but status is Completed, set back to Active
      if (hasActiveOrUpcomingRotations && intern.status === 'Completed') {
        const newStatus = intern.extension_days > 0 ? 'Extended' : 'Active';
        console.log(`[AutoAdvance] Intern ${intern.id} (${intern.name}) has active/upcoming rotations, updating status from Completed to ${newStatus}`);
        try {
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE interns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [newStatus, intern.id],
              function(err) {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          console.log(`[AutoAdvance] ✅ Intern ${intern.id} status updated to ${newStatus}`);
        } catch (err) {
          console.error(`[AutoAdvance] Error updating intern ${intern.id} status:`, err);
        }
      }
      
      if (rotationsToCreate > 0) {
        // Check if this would be the last unit
        const nextUnit = await getNextUnitForIntern(intern.id, units, allInternsOrdered, lastRotation);
        
        if (!nextUnit) {
          console.warn(`[AutoAdvance] No available unit for intern ${intern.id} (${intern.name})`);
          skipped++;
          continue;
        }
        
        // Calculate start date for next rotation
        let newStartDate = nextStartDate;
        let newStartDateStr = format(newStartDate, 'yyyy-MM-dd');
        
        // Use unit's default duration
        let durationDays = nextUnit.duration_days;
        
        // If this will be the last unit and intern is extended, add extension days
        const willCompletedUnits = new Set([...completedUnits, nextUnit.id]);
        if (willCompletedUnits.size >= units.length && intern.status === 'Extended') {
          durationDays += (intern.extension_days || 0);
        }
        
        const newEndDate = addDays(newStartDate, durationDays - 1);
        const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');
        
        // Check if this rotation already exists
        const existingRotation = allRotationsHistory.find(r => 
          r.start_date === newStartDateStr && r.unit_id === nextUnit.id
        );
        
        if (!existingRotation) {
          // Create the new automatic rotation
          try {
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
                 VALUES (?, ?, ?, ?, FALSE)`,
                [intern.id, nextUnit.id, newStartDateStr, newEndDateStr],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            advanced++;
            
            // Note: We don't mark as Completed here anymore
            // Status is only set to Completed when there are no active/upcoming rotations
            // This happens in the check above before creating new rotations
          } catch (err) {
            console.error(`[AutoAdvance] Error creating rotation for intern ${intern.id}:`, err);
            errors++;
          }
        } else {
          skipped++;
        }
      } else {
        // Already has upcoming rotations
        skipped++;
      }
    } catch (err) {
      console.error(`Error auto-advancing rotation for intern ${intern.id}:`, err);
      errors++;
    }
  }
  
  return { advanced, skipped, errors, total: interns.length };
}

// Helper function to generate rotations for a single intern
function generateInternRotations(intern, units, startDate, settings, internIndex = 0) {
  const rotations = [];
  if (!units || units.length === 0) {
    return rotations;
  }

  // Use the provided startDate if available, otherwise use intern's start_date
  let currentDate = startDate || parseISO(intern.start_date);

  // Reorder units so each intern starts at a different offset (round-robin)
  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),
    ...units.slice(0, startUnitIndex)
  ];

  // Base cycle: rotate through every unit exactly once
  orderedUnits.forEach(unit => {
    const rotationStart = currentDate;
    const rotationEnd = addDays(rotationStart, unit.duration_days - 1);

    rotations.push({
      intern_id: intern.id,
      unit_id: unit.id,
      start_date: format(rotationStart, 'yyyy-MM-dd'),
      end_date: format(rotationEnd, 'yyyy-MM-dd')
    });

    currentDate = addDays(rotationEnd, 1);
  });

  // Extension handling – distribute extra days across additional rotations
  let remainingExtension = 0;
  if (intern.status === 'Extended') {
    const ext = parseInt(intern.extension_days, 10);
    if (!Number.isNaN(ext) && ext > 0) {
      remainingExtension = ext;
    }
  }

  while (remainingExtension > 0) {
    for (const unit of orderedUnits) {
      if (remainingExtension <= 0) break;

      const durationDays = Math.min(unit.duration_days, remainingExtension);
      const rotationStart = currentDate;
      const rotationEnd = addDays(rotationStart, durationDays - 1);

      rotations.push({
        intern_id: intern.id,
        unit_id: unit.id,
        start_date: format(rotationStart, 'yyyy-MM-dd'),
        end_date: format(rotationEnd, 'yyyy-MM-dd')
      });

      currentDate = addDays(rotationEnd, 1);
      remainingExtension -= durationDays;
    }
  }

  return rotations;
}

module.exports = router;
module.exports.getNextUnitForIntern = getNextUnitForIntern;
module.exports.getRoundRobinCounter = getRoundRobinCounter;
module.exports.setRoundRobinCounter = setRoundRobinCounter;
