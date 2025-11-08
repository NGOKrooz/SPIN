const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');
const { addDays, format, parseISO, differenceInDays } = require('date-fns');
const { getNextUnitForIntern } = require('./rotations');

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
              try {
                const startDate = parseISO(row.start_date);
                const today = new Date();
                // Normalize both dates to start of day for accurate comparison
                startDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                // Calculate difference in milliseconds, then convert to days
                const diffMs = today.getTime() - startDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                // Add 1 to include today (if start date is today, it's day 1)
                daysInInternship = Math.max(1, diffDays + 1);
              } catch (dateErr) {
                console.error(`Error calculating days for intern ${row.id}:`, dateErr);
                daysInInternship = 0;
              }
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
        return res.status(500).json({ 
          error: 'Failed to create intern',
          details: err.message || String(err)
        });
      }
      
      const internId = this.lastID;
      
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
        // Use adjustment_days if provided (for updates), otherwise use extension_days (for first-time extensions)
        const daysToExtend = adjustment_days || extension_days;
        if (!unit_id || !daysToExtend) return resolve();
        const findActive = `
          SELECT id, end_date FROM rotations
          WHERE intern_id = ? AND unit_id = ? AND start_date <= date('now') AND end_date >= date('now')
          ORDER BY start_date DESC LIMIT 1
        `;
        db.get(findActive, [id, unit_id], (e, row) => {
          if (e || !row) return resolve();
          const newEnd = format(addDays(parseISO(row.end_date), parseInt(daysToExtend)), 'yyyy-MM-dd');
          // Mark as manual assignment so auto-advance doesn't overwrite the extended rotation
          const upd = 'UPDATE rotations SET end_date = ?, is_manual_assignment = 1 WHERE id = ?';
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
  
  // Auto-advance rotation if enabled and needed for this intern
  const autoRotationEnabled = process.env.AUTO_ROTATION === 'true';
  console.log(`[Schedule] AUTO_ROTATION=${process.env.AUTO_ROTATION}, enabled=${autoRotationEnabled}`);
  
  if (autoRotationEnabled) {
    try {
      console.log(`[Schedule] Running auto-advance for intern ${id}...`);
      const result = await autoAdvanceInternRotation(id);
      console.log(`[Schedule] Auto-advance result:`, result);
    } catch (err) {
      console.error(`Error auto-advancing rotation for intern ${id}:`, err);
      // Continue even if auto-advance fails
    }
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

// POST /api/interns/:id/force-auto-advance - Manually trigger auto-advance (for testing/debugging)
router.post('/:id/force-auto-advance', async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log(`[ForceAutoAdvance] Manually triggering auto-advance for intern ${id}`);
    const result = await autoAdvanceInternRotation(id);
    
    // Get updated schedule
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
      
      res.json({
        success: true,
        autoAdvanceResult: result,
        rotations: rows,
        count: rows.length,
        message: result ? 'Rotations created successfully' : 'No new rotations needed'
      });
    });
  } catch (err) {
    console.error(`[ForceAutoAdvance] Error:`, err);
    console.error(`[ForceAutoAdvance] Stack:`, err.stack);
    res.status(500).json({ 
      error: 'Failed to force auto-advance',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Helper function to auto-advance a single intern's rotation
// Creates automatic rotations (is_manual_assignment = FALSE) for upcoming assignments
// Always ensures there's an upcoming rotation visible
async function autoAdvanceInternRotation(internId) {
  console.log(`[AutoAdvance] Starting for intern ${internId}`);
  
  // Use UTC date to avoid timezone issues in production
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const today = format(todayUTC, 'yyyy-MM-dd');
  
  console.log(`[AutoAdvance] Today: ${today}`);
  
  // Get all units in order (rotation sequence)
  const units = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM units ORDER BY id', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  if (units.length === 0) {
    console.log(`[AutoAdvance] No units found in database`);
    return false;
  }
  
  console.log(`[AutoAdvance] Found ${units.length} units`);
  
  // Get all active interns (ordered consistently for round-robin indexing)
  const allInterns = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM interns WHERE status IN ('Active', 'Extended') ORDER BY id ASC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
  
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
    console.log(`[AutoAdvance] Intern ${internId} not found or not active`);
    return false;
  }
  
  console.log(`[AutoAdvance] Found intern: ${intern.name}, start_date: ${intern.start_date}`);
  
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
  
  console.log(`[AutoAdvance] Intern ${internId} has ${allRotationsHistory.length} total rotations`);

  if (!intern.start_date) {
    console.error(`[AutoAdvance] Intern ${internId} (${intern.name}): Missing start_date, cannot create rotations`);
    return false;
  }

  let internStartDate = parseDateSafe(intern.start_date);
  if (!internStartDate) {
    console.error(`[AutoAdvance] Intern ${internId} (${intern.name}): Invalid start_date "${intern.start_date}"`);
    return false;
  }

  // Get the last rotation (ordered by end_date DESC to get the most recent)
  const lastRotationQuery = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM rotations 
       WHERE intern_id = ?
       ORDER BY end_date DESC
       LIMIT 1`,
      [internId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
  
  let lastRotation = lastRotationQuery;

  if (!lastRotation) {
    console.log(`[AutoAdvance] Intern ${internId} has no rotations history - creating first automatic rotation`);

    if (units.length === 0) {
      console.log(`[AutoAdvance] No units available, cannot create first rotation`);
      return false;
    }

    // Use round-robin logic to get the first unit for this intern
    const firstUnit = await getNextUnitForIntern(internId, units, allInterns, null);
    
    if (!firstUnit) {
      console.log(`[AutoAdvance] No available unit for intern ${internId}`);
      return false;
    }
    
    const todayDateObj = parseDateSafe(today);
    let firstRotationStart = internStartDate < todayDateObj ? addDays(todayDateObj, 1) : internStartDate;
    const firstRotationStartStr = format(firstRotationStart, 'yyyy-MM-dd');
    const firstRotationEnd = addDays(firstRotationStart, firstUnit.duration_days - 1);
    const firstRotationEndStr = format(firstRotationEnd, 'yyyy-MM-dd');

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
           VALUES (?, ?, ?, ?, FALSE)`,
          [internId, firstUnit.id, firstRotationStartStr, firstRotationEndStr],
          function(err) {
            if (err) {
              console.error(`[AutoAdvance] Error creating first rotation for intern ${internId}:`, err);
              reject(err);
            } else {
              console.log(`[AutoAdvance] ✅ Created first rotation: ${firstUnit.name} from ${firstRotationStartStr} to ${firstRotationEndStr}`);
              resolve();
            }
          }
        );
      });

      allRotationsHistory.push({
        intern_id: internId,
        unit_id: firstUnit.id,
        start_date: firstRotationStartStr,
        end_date: firstRotationEndStr,
        is_manual_assignment: 0,
      });

    } catch (err) {
      console.error(`[AutoAdvance] Failed to create first rotation for intern ${internId}:`, err);
      return false;
    }
  }

  const sortedRotations = allRotationsHistory
    .filter(r => r.end_date)
    .sort((a, b) => {
      const endA = parseDateSafe(a.end_date);
      const endB = parseDateSafe(b.end_date);
      return endA.getTime() - endB.getTime();
    });

  if (sortedRotations.length === 0) {
    console.error(`[AutoAdvance] Intern ${internId}: Unable to determine last rotation after seeding`);
    return false;
  }

  const lastRotationSorted = sortedRotations[sortedRotations.length - 1];
  const lastEndDate = parseDateSafe(lastRotationSorted.end_date);

  if (!lastEndDate) {
    console.error(`[AutoAdvance] Intern ${internId}: Last rotation has invalid end_date "${lastRotationSorted.end_date}"`);
    return false;
  }

  let nextStartDate = addDays(lastEndDate, 1);
  const todayDateObj = parseDateSafe(today);
  if (todayDateObj && nextStartDate <= todayDateObj) {
    nextStartDate = addDays(todayDateObj, 1);
  }
  const nextStartDateStr = format(nextStartDate, 'yyyy-MM-dd');

  const existingUpcoming = sortedRotations.find(r => {
    if (!r.start_date) return false;
    const start = parseDateSafe(r.start_date);
    return start && start >= nextStartDate;
  });

  if (existingUpcoming) {
    const existingStart = parseDateSafe(existingUpcoming.start_date);
    if (existingStart && existingStart <= lastEndDate) {
      console.log(`[AutoAdvance] Found ongoing rotation starting ${format(existingStart, 'yyyy-MM-dd')} – continuing sequence.`);
    } else {
      console.log(`[AutoAdvance] Rotation already scheduled starting ${existingStart ? format(existingStart, 'yyyy-MM-dd') : existingUpcoming.start_date} for intern ${internId} – skipping auto creation.`);
      return false;
    }
  }

  // Use flexible, fair round-robin logic to get next unit
  const nextUnit = await getNextUnitForIntern(internId, units, allInterns, lastRotation);
  
  if (!nextUnit) {
    console.warn(`[AutoAdvance] No available unit for intern ${internId}`);
    return false;
  }

  const internshipEndDate = addDays(
    internStartDate,
    intern.status === 'Extended' ? 365 + (intern.extension_days || 0) : 365
  );
  if (nextStartDate > internshipEndDate) {
    console.log(`[AutoAdvance] Internship ended for intern ${internId}; stopping auto-advance`);
    return false;
  }

  const nextEndDate = addDays(nextStartDate, nextUnit.duration_days - 1);
  const nextEndDateStr = format(nextEndDate, 'yyyy-MM-dd');

  try {
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
         VALUES (?, ?, ?, ?, FALSE)`,
        [internId, nextUnit.id, nextStartDateStr, nextEndDateStr],
        function(err) {
          if (err) {
            console.error(`[AutoAdvance] ❌ Error creating rotation for intern ${internId}:`, err);
            reject(err);
          } else {
            console.log(`[AutoAdvance] ✅ Created automatic rotation: ${nextUnit.name} from ${nextStartDateStr} to ${nextEndDateStr}`);
            resolve();
          }
        }
      );
    });

    return true;
  } catch (err) {
    console.error(`[AutoAdvance] ❌ Exception creating rotation for intern ${internId}:`, err);
    return false;
  }

}

// Helper function to generate rotations for a new intern (called asynchronously)
async function generateRotationsForIntern(internId, batch, start_date) {
  try {
    // Get all active interns ordered by ID for round-robin indexing
    const allInterns = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM interns WHERE status IN ('Active', 'Extended') ORDER BY id ASC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    // Find the new intern's index for round-robin assignment
    const internIndex = allInterns.findIndex(i => i.id === internId);
    if (internIndex === -1) {
      console.error(`[GenerateRotations] Intern ${internId} not found in active interns list`);
      return;
    }
    
    // Get all units ordered by ID for consistent round-robin sequence
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM units ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
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
    
    // Pass internIndex for round-robin assignment
    const rotations = generateInternRotations(
      internData,
      units,
      parseISO(start_date),
      settings,
      internIndex
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
    
  } catch (genErr) {
    console.error('Error auto-generating rotations:', genErr);
    // Don't fail intern creation if rotation generation fails
  }
}

// Helper function to generate rotations for a single intern
function generateInternRotations(intern, units, startDate, settings, internIndex = 0) {
  const rotations = [];
  const internshipDuration = intern.status === 'Extended' 
    ? 365 + (intern.extension_days || 0) 
    : 365;
  
  let currentDate = parseISO(intern.start_date);
  const endDate = addDays(currentDate, internshipDuration);
  
  // Calculate base total rotation days (sum of all unit durations)
  const baseRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
  
  // Calculate extension multiplier to distribute extra days across all units
  // For extended interns, each unit duration is proportionally increased
  const extensionMultiplier = internshipDuration / baseRotationDays;
  
  // Calculate how many full cycles we can fit
  const cycles = Math.ceil(extensionMultiplier);
  
  // Reorder units so each intern starts at a different offset (round-robin)
  // Intern 0 starts at unit[0], Intern 1 starts at unit[1], etc.
  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),  // Units from start position to end
    ...units.slice(0, startUnitIndex) // Wrap around: units from beginning to start position
  ];
  
  let rotationIndex = 0;
  
  while (currentDate < endDate && rotationIndex < orderedUnits.length * cycles) {
    // Pick the next unit in the reordered sequence
    const unitIndex = rotationIndex % orderedUnits.length;
    const unit = orderedUnits[unitIndex];
    
    // Start date is current date (immediate, no gaps)
    const rotationStart = currentDate;
    
    // Calculate extended duration for this unit
    // For extended interns, each unit gets proportionally more days
    const extendedUnitDuration = Math.round(unit.duration_days * extensionMultiplier / cycles);
    
    // Calculate end date based on extended unit duration (includes off days)
    // Duration is the number of calendar days, including off days
    let rotationEnd = addDays(rotationStart, extendedUnitDuration - 1);
    
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
  }
  
  return rotations;
}

const parseDateSafe = (value) => {
  if (!value) return null;
  try {
    let date = parseISO(value);
    if (isNaN(date)) {
      date = new Date(value);
    }
    if (isNaN(date)) {
      return null;
    }
    return date;
  } catch (err) {
    return null;
  }
};

// Export the auto-advance function for use in other routes
module.exports = router;
module.exports.autoAdvanceInternRotation = autoAdvanceInternRotation;
