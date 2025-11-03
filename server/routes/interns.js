const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');
const { addDays, format, parseISO, differenceInDays } = require('date-fns');

const router = express.Router();

// Validation middleware
const validateIntern = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('gender').isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('batch').optional().isIn(['A', 'B']).withMessage('Batch must be A or B'),
  body('start_date').isISO8601().withMessage('Start date must be a valid date'),
  // Relax phone validation to any non-empty string if provided
  body('phone_number').optional().isString().withMessage('Phone number must be a string')
];

// GET /api/interns - Get all interns
router.get('/', (req, res) => {
  const { batch, status, unit_id } = req.query;
  
  let query = `
    SELECT 
      i.*,
      COUNT(r.id) as total_rotations,
      GROUP_CONCAT(u.name, '|') as current_units
    FROM interns i
    LEFT JOIN rotations r ON i.id = r.intern_id 
      AND r.start_date <= date('now') 
      AND r.end_date >= date('now')
    LEFT JOIN units u ON r.unit_id = u.id
  `;
  
  const conditions = [];
  const params = [];
  
  if (batch) {
    conditions.push('i.batch = ?');
    params.push(batch);
  }
  
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  
  if (unit_id) {
    conditions.push('r.unit_id = ?');
    params.push(unit_id);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY i.id ORDER BY i.start_date DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching interns:', err);
      return res.status(500).json({ error: 'Failed to fetch interns' });
    }
    
    // Ensure rows is an array
    const safeRows = Array.isArray(rows) ? rows : [];
    
    // Get all units to calculate total duration
    db.all('SELECT SUM(duration_days) as total FROM units', [], (err, unitRows) => {
      // Always return response, even if unit query fails
      try {
        const totalUnitDays = (unitRows && unitRows[0] && unitRows[0].total) ? unitRows[0].total : (safeRows.length > 0 ? 365 : 0);
        
        const interns = safeRows.map(row => {
          try {
            const baseDuration = totalUnitDays || 0;
            const extensionDays = row.status === 'Extended' ? (parseInt(row.extension_days) || 0) : 0;
            const totalDuration = baseDuration + extensionDays;
            
            // Calculate days in internship (including today, so add 1)
            // This matches the client-side calculation in InternDashboard
            let daysInInternship = 0;
            if (row.start_date) {
              const startDate = parseISO(row.start_date);
              const today = new Date();
              // Normalize both dates to start of day for accurate comparison
              startDate.setHours(0, 0, 0, 0);
              today.setHours(0, 0, 0, 0);
              const diffDays = differenceInDays(today, startDate);
              // Add 1 to include today (if start date is today, it's day 1)
              daysInInternship = Math.max(1, diffDays + 1);
            }
            
            return {
              ...row,
              current_units: row.current_units ? row.current_units.split('|').filter(Boolean) : [],
              days_since_start: daysInInternship,
              total_duration_days: totalDuration
            };
          } catch (mapErr) {
            console.error('Error mapping intern row:', mapErr);
            // Return basic row data if mapping fails
            return {
              ...row,
              current_units: [],
              days_since_start: 0,
              total_duration_days: 365
            };
          }
        });
        
        return res.json(interns);
      } catch (responseErr) {
        console.error('Error preparing response:', responseErr);
        // Return empty array as fallback
        return res.json([]);
      }
    });
  });
});

// GET /api/interns/:id - Get specific intern
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      i.*,
      r.id as rotation_id,
      r.start_date as rotation_start,
      r.end_date as rotation_end,
      r.is_manual_assignment,
      u.name as unit_name,
      u.id as unit_id
    FROM interns i
    LEFT JOIN rotations r ON i.id = r.intern_id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE i.id = ?
    ORDER BY r.start_date DESC
  `;
  
  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching intern:', err);
      return res.status(500).json({ error: 'Failed to fetch intern' });
    }
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }
    
    const intern = {
      ...rows[0],
      rotations: rows
        .filter(row => row.rotation_id)
        .map(row => ({
          id: row.rotation_id,
          unit_id: row.unit_id,
          unit_name: row.unit_name,
          start_date: row.rotation_start,
          end_date: row.rotation_end,
          is_manual_assignment: row.is_manual_assignment
        }))
    };
    
    // Remove rotation fields from main intern object
    delete intern.rotation_id;
    delete intern.rotation_start;
    delete intern.rotation_end;
    delete intern.is_manual_assignment;
    delete intern.unit_name;
    delete intern.unit_id;
    
    res.json(intern);
  });
});

// POST /api/interns - Create new intern
router.post('/', validateIntern, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { name, gender, batch, start_date, phone_number, initial_unit_id } = req.body;
  
  const query = `
    INSERT INTO interns (name, gender, batch, start_date, phone_number)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  // Auto-assign batch if not provided: alternate insertion order A/B
  const getNextBatch = new Promise((resolve) => {
    const countQuery = `SELECT COUNT(*) as count FROM interns`;
    db.get(countQuery, [], (e, row) => {
      if (e) return resolve('A');
      const next = (row.count % 2 === 0) ? 'A' : 'B';
      resolve(next);
    });
  });

  getNextBatch.then((nextBatch) => {
    const finalBatch = batch && ['A','B'].includes(batch) ? batch : nextBatch;
    
    // Create intern (don't use serialize for PostgreSQL compatibility)
    db.run(query, [name, gender, finalBatch, start_date, phone_number], function(err) {
      if (err) {
        console.error('Error creating intern:', err);
        console.error('Query:', query);
        console.error('Params:', [name, gender, finalBatch, start_date, phone_number]);
        return res.status(500).json({ 
          error: 'Failed to create intern',
          details: err.message || String(err)
        });
      }
      
      const internId = this.lastID;
      console.log('Intern created successfully with ID:', internId);
      
      // If initial unit is provided, create rotation
      if (initial_unit_id) {
          // Get unit duration
          db.get('SELECT duration_days FROM units WHERE id = ?', [initial_unit_id], (err, unit) => {
            if (err) {
              console.error('Error fetching unit:', err);
              return res.status(500).json({ error: 'Failed to fetch unit information' });
            }
            
            if (!unit) {
              return res.status(400).json({ error: 'Invalid unit selected' });
            }
            
            // Calculate end date: duration_days includes start day, so subtract 1
            const startDateParsed = parseISO(start_date);
            const endDate = addDays(startDateParsed, unit.duration_days - 1);
            
            // Create rotation
            const rotationQuery = `
              INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
              VALUES (?, ?, ?, ?, ?)
            `;
            
            db.run(rotationQuery, [internId, initial_unit_id, start_date, format(endDate, 'yyyy-MM-dd'), true], (err) => {
              if (err) {
                console.error('Error creating rotation:', err);
                return res.status(500).json({ error: 'Failed to create initial rotation' });
              }
              
              res.status(201).json({
                id: internId,
                name,
                gender,
                batch: finalBatch,
                start_date,
                phone_number,
                status: 'Active',
                extension_days: 0,
                initial_unit_id,
                calculated_end_date: format(endDate, 'yyyy-MM-dd')
              });
            });
          });
        } else {
          // Check if auto-generate on create is enabled (from JSON settings)
          db.get('SELECT value FROM settings WHERE key = ?', ['auto-generation'], (err, setting) => {
            if (err) {
              console.error('Error checking auto-generation setting:', err);
              return res.status(201).json({
                id: internId,
                name,
                gender,
                batch: finalBatch,
                start_date,
                phone_number,
                status: 'Active',
                extension_days: 0,
                auto_generated_rotations: false
              });
            }
            
            let autoGenerate = false;
            
            if (setting && setting.value) {
              try {
                const autoGenSettings = JSON.parse(setting.value);
                autoGenerate = autoGenSettings.auto_generate_on_create === true;
              } catch (e) {
                // If parsing fails, default to false
                autoGenerate = false;
              }
            }
            
            // Send response first, then generate rotations in background
            res.status(201).json({
              id: internId,
              name,
              gender,
              batch: finalBatch,
              start_date,
              phone_number,
              status: 'Active',
              extension_days: 0,
              auto_generated_rotations: autoGenerate
            });
            
            // Generate rotations asynchronously if enabled (don't block response)
            if (autoGenerate) {
              generateRotationsForIntern(internId, finalBatch, start_date).catch(err => {
                console.error('Error auto-generating rotations in background:', err);
              });
            }
          });
        }
      });
    }).catch(err => {
      console.error('Error in getNextBatch:', err);
      return res.status(500).json({ 
        error: 'Failed to create intern',
        details: err.message || String(err)
      });
    });
});

// PUT /api/interns/:id - Update intern
router.put('/:id', validateIntern, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { name, gender, batch, start_date, phone_number, status, extension_days } = req.body;
  
  // Auto-derive status: if extension_days > 0 -> Extended; else respect provided status if present, or keep existing
  const finalStatus = (typeof extension_days === 'number' && extension_days > 0) ? 'Extended' : (status || 'Active');

  const query = `
    UPDATE interns 
    SET name = ?, gender = ?, batch = ?, start_date = ?, phone_number = ?, 
        status = ?, extension_days = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  db.run(query, [name, gender, batch, start_date, phone_number, finalStatus, extension_days, id], function(err) {
    if (err) {
      console.error('Error updating intern:', err);
      return res.status(500).json({ error: 'Failed to update intern' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }
    
    res.json({ message: 'Intern updated successfully' });
  });
});

// POST /api/interns/:id/extend - Extend internship
router.post('/:id/extend', [
  body('extension_days').isInt({ min: 0, max: 365 }).withMessage('Extension must be 0-365 days'),
  body('adjustment_days').optional().isInt().withMessage('Adjustment must be a valid integer'),
  body('reason').isIn(['presentation', 'internal query', 'leave', 'other']).withMessage('Invalid extension reason'),
  body('unit_id').optional().isInt().withMessage('unit_id must be a valid id'),
  body('notes').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { extension_days, adjustment_days, reason, notes, unit_id } = req.body;
  
  db.serialize(() => {
    // Determine final status based on extension_days
    const finalStatus = extension_days > 0 ? 'Extended' : 'Active';
    
    // Update intern status
    const updateQuery = `
      UPDATE interns 
      SET status = ?, extension_days = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    db.run(updateQuery, [finalStatus, extension_days, id], function(err) {
      if (err) {
        console.error('Error extending internship:', err);
        return res.status(500).json({ error: 'Failed to extend internship' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Intern not found' });
      }
      
      // Optionally extend active rotation end_date for selected unit
      const extendActiveRotation = () => new Promise((resolve) => {
        if (!unit_id || !adjustment_days) return resolve();
        const findActive = `
          SELECT id, end_date FROM rotations
          WHERE intern_id = ? AND unit_id = ? AND start_date <= date('now') AND end_date >= date('now')
          ORDER BY start_date DESC LIMIT 1
        `;
        db.get(findActive, [id, unit_id], (e, row) => {
          if (e || !row) return resolve();
          const newEnd = format(addDays(parseISO(row.end_date), parseInt(adjustment_days)), 'yyyy-MM-dd');
          const upd = 'UPDATE rotations SET end_date = ? WHERE id = ?';
          db.run(upd, [newEnd, row.id], () => resolve());
        });
      });

      extendActiveRotation().then(() => {
        // Record extension reason (store adjustment_days if provided, otherwise extension_days)
        const daysToRecord = adjustment_days || extension_days;
        const reasonQuery = `
          INSERT INTO extension_reasons (intern_id, extension_days, reason, notes)
          VALUES (?, ?, ?, ?)
        `;
        
        db.run(reasonQuery, [id, daysToRecord, reason, notes], function(err) {
          if (err) {
            console.error('Error recording extension reason:', err);
          }
          
          res.json({ 
            message: extension_days > 0 ? 'Internship extended successfully' : 'Extension removed successfully',
            extension_days,
            adjustment_days: adjustment_days || null,
            reason,
            notes,
            unit_id: unit_id || null,
            status: finalStatus
          });
        });
      });
    });
  });
});

// DELETE /api/interns/:id - Delete intern
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  const query = 'DELETE FROM interns WHERE id = ?';
  
  db.run(query, [id], function(err) {
    if (err) {
      console.error('Error deleting intern:', err);
      return res.status(500).json({ error: 'Failed to delete intern' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }
    
    res.json({ message: 'Intern deleted successfully' });
  });
});

// GET /api/interns/:id/schedule - Get intern's rotation schedule
router.get('/:id/schedule', async (req, res) => {
  const { id } = req.params;
  
  // Auto-advance rotation if needed for this intern
  try {
    await autoAdvanceInternRotation(id);
  } catch (err) {
    console.error(`Error auto-advancing rotation for intern ${id}:`, err);
    // Continue even if auto-advance fails
  }
  
  const query = `
    SELECT 
      r.*,
      u.name as unit_name,
      u.duration_days,
      u.workload
    FROM rotations r
    JOIN units u ON r.unit_id = u.id
    WHERE r.intern_id = ?
    ORDER BY r.start_date
  `;
  
  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching schedule:', err);
      return res.status(500).json({ error: 'Failed to fetch schedule' });
    }
    
    res.json(rows);
  });
});

// Helper function to auto-advance a single intern's rotation
// Creates automatic rotations (is_manual_assignment = FALSE) for upcoming assignments
// Always ensures there's an upcoming rotation visible
async function autoAdvanceInternRotation(internId) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayDate = parseISO(today);
  
  // Get all units in order (rotation sequence)
  const units = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM units ORDER BY id', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  if (units.length === 0) {
    return false;
  }
  
  // Get the intern
  const intern = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM interns WHERE id = ? AND status IN ('Active', 'Extended')`,
      [internId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  
  if (!intern) {
    return false;
  }
  
  // Get ALL rotations for this intern (both manual and automatic) to find the last one
  const allRotationsHistory = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM rotations 
       WHERE intern_id = ?
       ORDER BY start_date ASC`,
      [internId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
  
  if (allRotationsHistory.length === 0) {
    console.log(`[autoAdvance] Intern ${internId} has no rotations history`);
    return false;
  }
  
  // Get all automatic rotations to check for existing upcoming ones
  const automaticRotations = allRotationsHistory.filter(r => !r.is_manual_assignment);
  console.log(`[autoAdvance] Intern ${internId}: total rotations=${allRotationsHistory.length}, automatic=${automaticRotations.length}`);
  
  // Get the last rotation (manual or automatic) to determine next unit
  const lastRotation = allRotationsHistory[allRotationsHistory.length - 1];
  const lastEndDate = parseISO(lastRotation.end_date);
  console.log(`[autoAdvance] Intern ${internId}: last rotation end_date=${lastRotation.end_date}, today=${today}`);
  
  // Check if there's an upcoming automatic rotation (start_date > today)
  const upcomingAutomaticRotations = automaticRotations.filter(r => {
    const rotationStartDate = parseISO(r.start_date);
    // Compare dates (not time) by converting to ISO strings
    return format(rotationStartDate, 'yyyy-MM-dd') > format(todayDate, 'yyyy-MM-dd');
  });
  console.log(`[autoAdvance] Intern ${internId}: found ${upcomingAutomaticRotations.length} upcoming automatic rotations`);
  
  // Check if we need to generate upcoming automatic rotations
  // We always want at least one upcoming rotation visible
  let needsUpcomingRotation = false;
  
  if (upcomingAutomaticRotations.length === 0) {
    // No upcoming automatic rotations, need to create at least one
    needsUpcomingRotation = true;
  } else {
    // Check if the upcoming automatic rotations cover until after the last rotation ends
    const lastUpcomingEndDate = parseISO(upcomingAutomaticRotations[upcomingAutomaticRotations.length - 1].end_date);
    if (lastUpcomingEndDate <= lastEndDate) {
      // Upcoming rotations don't go far enough, need more
      needsUpcomingRotation = true;
    }
  }
  
  console.log(`[autoAdvance] Intern ${internId}: needsUpcomingRotation=${needsUpcomingRotation}, lastEndDate=${lastRotation.end_date}, today=${today}`);
  
  if (needsUpcomingRotation) {
    // Find which unit the intern was on (from last rotation, which could be manual)
    let currentUnitIndex = units.findIndex(u => u.id === lastRotation.unit_id);
    
    if (currentUnitIndex === -1) {
      console.warn(`[autoAdvance] Unit ${lastRotation.unit_id} not found for intern ${internId}`);
      return false;
    }
    
    // Check if intern's internship has ended
    const internshipEndDate = addDays(
      parseISO(intern.start_date),
      intern.status === 'Extended' ? 365 + (intern.extension_days || 0) : 365
    );
    
    // Calculate where next rotation should start (day after last rotation ends)
    const nextStartDate = addDays(lastEndDate, 1);
    
    if (parseISO(format(nextStartDate, 'yyyy-MM-dd')) > internshipEndDate) {
      // Internship has ended
      console.log(`[autoAdvance] Internship ended for intern ${internId}`);
      return false;
    }
    
    // Create multiple upcoming rotations to ensure there's always at least one visible
    let created = 0;
    let currentStartDate = nextStartDate;
    let unitIndex = currentUnitIndex;
    
    // Create at least 3 upcoming rotations to ensure visibility
    while (created < 3 && parseISO(format(currentStartDate, 'yyyy-MM-dd')) <= internshipEndDate) {
      // Get next unit in rotation sequence (cycle back if at end)
      unitIndex = (unitIndex + 1) % units.length;
      const nextUnit = units[unitIndex];
      
      // Calculate end date based on unit duration
      const newEndDate = addDays(currentStartDate, nextUnit.duration_days - 1);
      const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');
      const newStartDateStr = format(currentStartDate, 'yyyy-MM-dd');
      
      // Check if this would exceed internship end date
      if (newEndDate > internshipEndDate) {
        break;
      }
      
      // Check if this rotation already exists
      const existingRotation = allRotationsHistory.find(r => 
        r.start_date === newStartDateStr && r.unit_id === nextUnit.id
      );
      
      if (!existingRotation) {
        console.log(`[autoAdvance] Creating new rotation for intern ${internId}: ${nextUnit.name} from ${newStartDateStr} to ${newEndDateStr}`);
        // Create the new automatic rotation
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
             VALUES (?, ?, ?, ?, FALSE)`,
            [internId, nextUnit.id, newStartDateStr, newEndDateStr],
            function(err) {
              if (err) reject(err);
              else {
                console.log(
                  `✅ Auto-created upcoming rotation for intern ${internId} (${intern.name}): ${nextUnit.name} starting ${newStartDateStr}`
                );
                resolve();
              }
            }
          );
        });
        
        created++;
      }
      
      // Move to next rotation start date
      currentStartDate = addDays(newEndDate, 1);
    }
    
    return created > 0;
  }
  
  return false;
}

// Helper function to generate rotations for a new intern (called asynchronously)
async function generateRotationsForIntern(internId, batch, start_date) {
  try {
    // Get all units
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM units ORDER BY id', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Get settings for rotation generation
    const settings = await new Promise((resolve, reject) => {
      db.all('SELECT key, value FROM settings', [], (err, rows) => {
        if (err) reject(err);
        else {
          const settingsObj = rows.reduce((acc, row) => {
            try {
              // Try to parse JSON, fallback to string
              const value = row.value.startsWith('{') || row.value.startsWith('[') 
                ? JSON.parse(row.value) 
                : row.value;
              acc[row.key] = value;
            } catch {
              acc[row.key] = row.value;
            }
            return acc;
          }, {});
          resolve(settingsObj);
        }
      });
    });
    
    // Generate rotations for this intern
    const internData = {
      id: internId,
      batch,
      start_date,
      status: 'Active',
      extension_days: 0
    };
    
    const rotations = generateInternRotations(
      internData,
      units,
      parseISO(start_date),
      settings
    );
    
    // Insert generated rotations
    for (const rotation of rotations) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
           VALUES (?, ?, ?, ?, FALSE)`,
          [rotation.intern_id, rotation.unit_id, rotation.start_date, rotation.end_date],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    console.log(`✅ Auto-generated ${rotations.length} rotations for intern ${internId}`);
    
  } catch (genErr) {
    console.error('Error auto-generating rotations:', genErr);
    // Don't fail intern creation if rotation generation fails
  }
}

// Helper function to generate rotations for a single intern
function generateInternRotations(intern, units, startDate, settings) {
  const rotations = [];
  
  if (!units || units.length === 0) {
    console.warn('No units available for rotation generation');
    return rotations;
  }
  
  // Calculate internship duration based on units (one rotation through all units)
  // Internship ends after completing all units once, not after 365 days
  const totalRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
  
  // If extended, add extension days
  const extensionDays = intern.status === 'Extended' ? (intern.extension_days || 0) : 0;
  const internshipDuration = totalRotationDays + extensionDays;
  
  let currentDate = parseISO(intern.start_date);
  const endDate = addDays(currentDate, internshipDuration);
  
  // Generate rotations through all units once (plus any extension cycles if needed)
  let rotationIndex = 0;
  
  // Go through all units at least once
  while (currentDate < endDate && rotationIndex < units.length * 1000) { // Safety limit
    const unitIndex = rotationIndex % units.length;
    const unit = units[unitIndex];
    
    // Start date is current date (immediate, no gaps)
    const rotationStart = currentDate;
    
    // Calculate end date based on unit duration (includes off days)
    // Duration is the number of calendar days, including off days
    let rotationEnd = addDays(rotationStart, unit.duration_days - 1);
    
    // Ensure rotation doesn't exceed internship end date
    const actualEnd = rotationEnd > endDate ? endDate : rotationEnd;
    
    rotations.push({
      intern_id: intern.id,
      unit_id: unit.id,
      start_date: format(rotationStart, 'yyyy-MM-dd'),
      end_date: format(actualEnd, 'yyyy-MM-dd')
    });
    
    // Next rotation starts immediately after this one ends (no gaps)
    currentDate = addDays(actualEnd, 1);
    rotationIndex++;
    
    // If we've completed all units once and there's no extension, stop
    if (rotationIndex === units.length && extensionDays === 0) {
      break;
    }
  }
  
  return rotations;
}


module.exports = router;
