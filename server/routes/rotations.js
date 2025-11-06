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
  
  if (units.length === 0) {
    return { advanced: 0, skipped: 0, errors: 0 };
  }
  
  // Get all active interns
  const interns = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM interns WHERE status IN ('Active', 'Extended')`,
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
  
  for (const intern of interns) {
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
      
      if (allRotationsHistory.length === 0) {
        // No rotations yet, skip (should be handled by initial generation)
        console.log(`[AutoAdvance] Intern ${intern.id} (${intern.name}): No rotations yet, skipping`);
        skipped++;
        continue;
      }
      
      // Get all automatic rotations to check for existing upcoming ones
      const automaticRotations = allRotationsHistory.filter(r => !r.is_manual_assignment);
      
      // Get the last rotation (manual or automatic) to determine next unit
      const lastRotation = allRotationsHistory[allRotationsHistory.length - 1];
      
      // Validate last rotation has valid end_date
      if (!lastRotation.end_date) {
        console.error(`[AutoAdvance] Intern ${intern.id}: Last rotation has no end_date, skipping`);
        errors++;
        continue;
      }
      
      let lastEndDate;
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
      
      if (rotationsToCreate > 0) {
        // Find which unit the intern was on (from last rotation, which could be manual)
        let currentUnitIndex = units.findIndex(u => u.id === lastRotation.unit_id);
        
        if (currentUnitIndex === -1) {
          console.warn(`Unit ${lastRotation.unit_id} not found for intern ${intern.id}`);
          errors++;
          continue;
        }
        
        // Check if intern's internship has ended
        let internshipEndDate;
        try {
          internshipEndDate = addDays(
            internStartDate,
            intern.status === 'Extended' ? 365 + (intern.extension_days || 0) : 365
          );
          if (isNaN(internshipEndDate.getTime())) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Invalid internshipEndDate calculated, skipping`);
            errors++;
            continue;
          }
        } catch (err) {
          console.error(`[AutoAdvance] Intern ${intern.id}: Error calculating internshipEndDate:`, err);
          errors++;
          continue;
        }
        
        // Generate the next rotation(s)
        let currentStartDate = nextStartDate;
        let unitIndex = currentUnitIndex;
        let created = 0;
        
        while (created < rotationsToCreate) {
          // Validate currentStartDate before comparing
          let currentStartDateStr;
          try {
            currentStartDateStr = format(currentStartDate, 'yyyy-MM-dd');
            const currentStartDateParsed = parseISO(currentStartDateStr);
            if (isNaN(currentStartDateParsed.getTime()) || currentStartDateParsed > internshipEndDate) {
              break;
            }
          } catch (err) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Error validating currentStartDate:`, err);
            break;
          }
          // Get next unit in rotation sequence (cycle back if at end)
          unitIndex = (unitIndex + 1) % units.length;
          const nextUnit = units[unitIndex];
          
          // Validate currentStartDate before using it
          if (isNaN(currentStartDate.getTime())) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Invalid currentStartDate, breaking loop`);
            break;
          }
          
          // Calculate end date based on unit duration
          let newEndDate;
          try {
            newEndDate = addDays(currentStartDate, nextUnit.duration_days - 1);
            if (isNaN(newEndDate.getTime())) {
              console.error(`[AutoAdvance] Intern ${intern.id}: Invalid newEndDate calculated, skipping`);
              break;
            }
          } catch (err) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Error calculating newEndDate:`, err);
            break;
          }
          
          let newEndDateStr, newStartDateStr;
          try {
            newEndDateStr = format(newEndDate, 'yyyy-MM-dd');
            newStartDateStr = format(currentStartDate, 'yyyy-MM-dd');
          } catch (err) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Error formatting dates:`, err);
            break;
          }
          
          // Check if this would exceed internship end date
          if (newEndDate > internshipEndDate) {
            break;
          }
          
          // Check if this rotation already exists
          const existingRotation = allRotationsHistory.find(r => 
            r.start_date === newStartDateStr && r.unit_id === nextUnit.id
          );
          
          if (!existingRotation) {
            // Create the new automatic rotation
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
            
            created++;
            advanced++;
          }
          
          // Next rotation starts the day after this one ends
          try {
            currentStartDate = addDays(newEndDate, 1);
            if (isNaN(currentStartDate.getTime())) {
              console.error(`[AutoAdvance] Intern ${intern.id}: Invalid currentStartDate after addDays, breaking`);
              break;
            }
          } catch (err) {
            console.error(`[AutoAdvance] Intern ${intern.id}: Error calculating next currentStartDate:`, err);
            break;
          }
        }
        
        if (created === 0) {
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
function generateInternRotations(intern, units, startDate, settings) {
  const rotations = [];
  const internshipDuration = intern.status === 'Extended' 
    ? 365 + (intern.extension_days || 0) 
    : 365;
  
  let currentDate = parseISO(intern.start_date);
  const endDate = addDays(currentDate, internshipDuration);
  
  // Calculate total rotation days needed (sum of all unit durations)
  const totalRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
  const cycles = Math.ceil(internshipDuration / totalRotationDays);
  
  let rotationIndex = 0;
  
  while (currentDate < endDate && rotationIndex < units.length * cycles) {
    const unitIndex = rotationIndex % units.length;
    const unit = units[unitIndex];
    
    // Start date is current date (immediate, no gaps)
    const rotationStart = currentDate;
    
    // Calculate end date based on unit duration (includes off days)
    // Duration is the number of calendar days, including off days
    let rotationEnd = addDays(rotationStart, unit.duration_days - 1);
    
    // Ensure rotation doesn't exceed internship end date
    const actualEnd = rotationEnd > endDate ? endDate : rotationEnd;
    
    // Include off days - no adjustment, just use the calculated dates
    // The duration includes calendar days, so off days are part of the rotation
    
    rotations.push({
      intern_id: intern.id,
      unit_id: unit.id,
      start_date: format(rotationStart, 'yyyy-MM-dd'),
      end_date: format(actualEnd, 'yyyy-MM-dd')
    });
    
    // Next rotation starts immediately after this one ends (no gaps)
    currentDate = addDays(actualEnd, 1);
    rotationIndex++;
  }
  
  return rotations;
}

module.exports = router;
