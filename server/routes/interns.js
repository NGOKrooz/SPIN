const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');
const { addDays, format, parseISO } = require('date-fns');
const { buildInternSchedule } = require('../services/internScheduleService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');
// Lazy load to avoid circular dependency - rotations.js is loaded after interns.js in index.js
let getNextUnitForIntern, getRoundRobinCounter, setRoundRobinCounter;
function getRotationHelpers() {
  if (!getNextUnitForIntern) {
    const rotationsModule = require('./rotations');
    getNextUnitForIntern = rotationsModule.getNextUnitForIntern;
    getRoundRobinCounter = rotationsModule.getRoundRobinCounter;
    setRoundRobinCounter = rotationsModule.setRoundRobinCounter;
  }
  return { getNextUnitForIntern, getRoundRobinCounter, setRoundRobinCounter };
}

const router = express.Router();

const runAsync = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const getAsync = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });

const allAsync = (query, params = []) =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

// Helper function to log activities for Recent Updates
const logActivity = async (activityType, options = {}) => {
  try {
    const { internId, internName, unitId, unitName, details } = options;
    
    await runAsync(
      `INSERT INTO activity_log (activity_type, intern_id, intern_name, unit_id, unit_name, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [activityType, internId || null, internName || null, unitId || null, unitName || null, details || null]
    );
  } catch (err) {
    // Don't fail the main operation if logging fails
    console.error(`[ActivityLog] Failed to log ${activityType}:`, err);
  }
};

const normalizeDbDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  try {
    const parsed = parseISO(typeof value === 'string' ? value : String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch (err) {
    console.warn('[ExtendInternship] Failed to parse DB date value:', value, err?.message);
    return null;
  }
};

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
  const { batch, status, unit_id, sort } = req.query;
  
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
  
  const sortMode = String(sort || 'newest').toLowerCase() === 'oldest' ? 'oldest' : 'newest';
  const orderDirection = sortMode === 'oldest' ? 'ASC' : 'DESC';
  query += ` GROUP BY i.id ORDER BY COALESCE(i.created_at, i.updated_at, NOW()) ${orderDirection}, i.id ${orderDirection}`;
  
  db.all(query, params, async (err, rows) => {
    if (err) {
      console.error('Error fetching interns:', err);
      return res.status(500).json({ error: 'Failed to fetch interns' });
    }
    
    // Ensure rows is an array
    const safeRows = Array.isArray(rows) ? rows : [];
    
    // Ensure status is correct for all interns (run in parallel, don't wait)
    safeRows.forEach(row => {
      ensureInternStatusIsCorrect(row.id).catch(err => {
        console.error(`[GET /interns] Error ensuring status for intern ${row.id}:`, err);
      });
    });
    
    // Get all units to calculate total duration
    db.all('SELECT SUM(duration_days) as total FROM units', [], (err, unitRows) => {
      // Always return response, even if unit query fails
      try {
        // Total duration = sum of all unit durations + extension days
        const totalUnitDays = (unitRows && unitRows[0] && unitRows[0].total) ? unitRows[0].total : 0;
        
        const interns = safeRows.map(row => {
          try {
            // Base duration is the sum of all unit durations (time to complete all units)
            const baseDuration = totalUnitDays || 0;
            // Always include extension_days if they exist, regardless of status
            const extensionDays = parseInt(row.extension_days) || 0;
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
  
  db.all(query, [id], async (err, rows) => {
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
    
    // Ensure status is correct before returning
    await ensureInternStatusIsCorrect(id).catch(err => {
      console.error(`[GET /interns/:id] Error ensuring status:`, err);
    });
    
    // Refresh intern data to get corrected status
    const correctedInternData = await getAsync(
      `SELECT * FROM interns WHERE id = ?`,
      [id]
    );
    
    if (correctedInternData) {
      intern.status = correctedInternData.status;
    }
    
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

// Helper function to verify database connection before operations
const verifyDatabaseConnection = () => {
  return new Promise((resolve) => {
    db.get('SELECT 1', [], (err) => {
      resolve(!err);
    });
  });
};

// POST /api/interns - Create new intern
router.post('/', validateIntern, async (req, res) => {
  // Verify database is connected before proceeding
  const dbConnected = await verifyDatabaseConnection();
  if (!dbConnected) {
    console.error('❌ Database connection unavailable when creating intern');
    return res.status(503).json({ 
      error: 'Database service unavailable',
      details: 'Cannot establish database connection. Please try again in a moment.'
    });
  }
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { name, gender, batch, start_date, phone_number, initial_unit_id } = req.body;
  console.log('[POST /interns] Creating new intern:', { name, gender, batch, start_date, phone_number, initial_unit_id });
  
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
    const finalBatch = batch && ['A','B'].includes(batch) ? batch : (nextBatch || 'A');
    console.log('[POST /interns] Final batch:', finalBatch);
    
    // Validate finalBatch
    if (!finalBatch || !['A','B'].includes(finalBatch)) {
      console.error('Error: Invalid batch value:', finalBatch);
      return res.status(500).json({ 
        error: 'Failed to create intern',
        details: 'Invalid batch value'
      });
    }
    
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
      console.log('[POST /interns] Intern created with ID:', internId);
      
      // Validate that internId was returned
      if (!internId) {
        console.error('Error: internId is null/undefined after insert');
        console.error('this.lastID:', this.lastID);
        console.error('this.changes:', this.changes);
        return res.status(500).json({ 
          error: 'Failed to create intern',
          details: 'Database did not return intern ID'
        });
      }
      
      // If initial unit is provided, create rotation
      if (initial_unit_id) {
        console.log('[POST /interns] Creating initial rotation for unit:', initial_unit_id);
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
            
            db.run(rotationQuery, [internId, initial_unit_id, start_date, format(endDate, 'yyyy-MM-dd'), true], async (err) => {
              if (err) {
                console.error('Error creating rotation:', err);
                return res.status(500).json({ error: 'Failed to create initial rotation' });
              }
              
              // Log activity
              try {
                const unit = await getAsync('SELECT name FROM units WHERE id = ?', [initial_unit_id]);
                await logActivity('new_intern', {
                  internId,
                  internName: name,
                  unitId: initial_unit_id,
                  unitName: unit?.name || null,
                  details: `New intern added to ${unit?.name || 'unit'}`
                });
                await logRecentUpdateSafe('intern_created', `Intern ${name} was added.`);
              } catch (logErr) {
                console.error('Error logging activity:', logErr);
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
          const autoGenerate = true;

          // Log activity (non-blocking)
          logActivity('new_intern', {
            internId,
            internName: name,
            details: `New intern added${autoGenerate ? ' with auto-generated rotations' : ''}`
          }).catch(err => console.error('Error logging activity:', err));
          logRecentUpdateSafe('intern_created', `Intern ${name} was added.`);

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

          // Generate rotations asynchronously (don't block response)
          console.log(`[POST /interns] Starting background rotation generation for intern ${internId}: batch=${finalBatch}, start_date=${start_date}`);
          generateRotationsForIntern(internId, finalBatch, start_date)
            .then(() => {
              console.log(`[POST /interns] ✅ Successfully completed rotation generation for intern ${internId}`);
            })
            .catch(err => {
              console.error(`[POST /interns] ❌ Error auto-generating rotations for intern ${internId}:`, err);
              console.error(`[POST /interns] Error details:`, err.message || String(err));
              console.error(`[POST /interns] Error stack:`, err.stack);
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
    logRecentUpdateSafe('intern_updated', `Intern ${name} was updated.`);
    
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
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { extension_days, adjustment_days, reason, notes, unit_id } = req.body;

  try {
    // Get current extension_days BEFORE updating to calculate the difference
    const currentIntern = await getAsync('SELECT extension_days FROM interns WHERE id = ?', [id]);
    if (!currentIntern) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const oldExtensionDays = parseInt(currentIntern.extension_days || 0, 10);
    const newExtensionDays = parseInt(extension_days || 0, 10);
    const daysDifference = newExtensionDays - oldExtensionDays;

    const finalStatus = extension_days > 0 ? 'Extended' : 'Active';

    const updateInternResult = await runAsync(
      `
        UPDATE interns 
        SET status = ?, extension_days = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [finalStatus, extension_days, id]
    );

    if (updateInternResult.changes === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const daysToExtendRaw = typeof adjustment_days === 'number' ? adjustment_days : extension_days;
    const daysToExtend = parseInt(daysToExtendRaw, 10);

    console.log(`[ExtendInternship] Updating internship for intern ${id}: old=${oldExtensionDays}, new=${newExtensionDays}, difference=${daysDifference}, unit_id: ${unit_id || 'none'}`);
    console.log(`[ExtendInternship] extension_days=${extension_days}, adjustment_days=${adjustment_days}, daysToExtend=${daysToExtend}`);

    // Update rotation if there's a change in extension days (positive or negative)
    // This handles both adding and removing extension days
    if (!Number.isNaN(daysDifference) && daysDifference !== 0) {
      try {
        // Use UTC date for consistent comparison across timezones
        const now = new Date();
        const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const todayStr = format(todayUTC, 'yyyy-MM-dd');
        
        console.log(`[ExtendInternship] Looking for ACTIVE (current) rotation for intern ${id}, today (UTC): ${todayStr}`);

        let rotation = null;
        let allRotations = [];

        // PRIORITY 1: If unit_id provided, ALWAYS find that specific unit's rotation FIRST
        // This is the most reliable way - if user specified unit_id, use it immediately
        if (unit_id) {
          try {
            // Direct database query for the most recent rotation with this unit_id
            rotation = await getAsync(
              `
                SELECT id, end_date, start_date, is_manual_assignment, unit_id FROM rotations
                WHERE intern_id = ? AND unit_id = ?
                ORDER BY end_date DESC
                LIMIT 1
              `,
              [id, unit_id]
            );
            
            if (rotation) {
              const rotEndDate = normalizeDbDate(rotation.end_date);
              if (rotEndDate) {
                const rotEndStr = format(rotEndDate, 'yyyy-MM-dd');
                const daysSinceEnd = Math.floor((parseISO(todayStr).getTime() - rotEndDate.getTime()) / (1000 * 60 * 60 * 24));
                console.log(`[ExtendInternship] ✅ Found rotation for unit_id ${unit_id} (ended ${daysSinceEnd} days ago): id=${rotation.id}, end_date=${rotEndStr}`);
              } else {
                console.log(`[ExtendInternship] ✅ Found rotation for unit_id ${unit_id}: id=${rotation.id}, end_date=${rotation.end_date}`);
              }
            } else {
              console.error(`[ExtendInternship] ❌ No rotation found for intern ${id} with unit_id ${unit_id}`);
            }
          } catch (unitErr) {
            console.error(`[ExtendInternship] Error finding rotation by unit_id:`, unitErr);
          }
        }
        
        // PRIORITY 2: If no unit_id provided or rotation not found, find ACTIVE rotation
        // This ensures we always extend the current unit the intern is in
        if (!rotation) {
          try {
            allRotations = await allAsync(
              `SELECT id, end_date, start_date, is_manual_assignment, unit_id FROM rotations WHERE intern_id = ? ORDER BY start_date DESC`,
              [id]
            );
            
            console.log(`[ExtendInternship] Checking ${allRotations.length} rotations for intern ${id} (no unit_id provided)`);
            
            // Find ACTIVE rotation using date-fns for reliable date comparison
            // Also consider recent rotations (within last 7 days) as they might be the current unit
            let mostRecentRotation = null;
            let mostRecentEndDate = null;
            
            for (const rot of allRotations) {
              try {
                const startDate = normalizeDbDate(rot.start_date);
                const endDate = normalizeDbDate(rot.end_date);
                
                if (startDate && endDate) {
                  const startStr = format(startDate, 'yyyy-MM-dd');
                  const endStr = format(endDate, 'yyyy-MM-dd');
                  
                  // Track the most recent rotation (by end_date) as fallback
                  if (!mostRecentRotation || (endStr > (mostRecentEndDate || ''))) {
                    mostRecentRotation = rot;
                    mostRecentEndDate = endStr;
                  }
                  
                  // Check if today falls within the rotation period (this is the CURRENT unit)
                  if (startStr <= todayStr && endStr >= todayStr) {
                    rotation = rot;
                    console.log(`[ExtendInternship] ✅ Found ACTIVE rotation: id=${rotation.id}, unit_id=${rotation.unit_id}, ${startStr} to ${endStr}`);
                    break;
                  }
                }
              } catch (rotErr) {
                console.error(`[ExtendInternship] Error processing rotation ${rot?.id}:`, rotErr);
                continue; // Skip this rotation and continue
              }
            }
            
            // If no active rotation found, use the most recent rotation (likely the current one)
            if (!rotation && mostRecentRotation) {
              const recentEndDate = normalizeDbDate(mostRecentRotation.end_date);
              if (recentEndDate) {
                const recentEndStr = format(recentEndDate, 'yyyy-MM-dd');
                const daysSinceEnd = Math.floor((parseISO(todayStr).getTime() - recentEndDate.getTime()) / (1000 * 60 * 60 * 24));
                
                // If the most recent rotation ended within the last 7 days, consider it the current unit
                if (daysSinceEnd <= 7) {
                  rotation = mostRecentRotation;
                  console.log(`[ExtendInternship] ✅ Using most recent rotation (ended ${daysSinceEnd} days ago): id=${rotation.id}, unit_id=${rotation.unit_id}, end_date=${recentEndStr}`);
                }
              }
            }
          } catch (rotationsErr) {
            console.error(`[ExtendInternship] Error fetching rotations:`, rotationsErr);
            // Continue to fallback methods
          }
        }
        
        // PRIORITY 3: Fallback - use SQL date comparison
        if (!rotation) {
          try {
            rotation = await getAsync(
              `
                SELECT id, end_date, start_date, is_manual_assignment, unit_id FROM rotations
                WHERE intern_id = ? AND start_date <= ? AND end_date >= ?
                ORDER BY start_date DESC
                LIMIT 1
              `,
              [id, todayStr, todayStr]
            );
            
            if (rotation) {
              console.log(`[ExtendInternship] Found rotation via SQL fallback: id=${rotation.id}`);
            }
          } catch (fallbackErr) {
            console.error(`[ExtendInternship] Error with SQL fallback:`, fallbackErr);
          }
        }

        // If we have a rotation, adjust it using SQL date arithmetic
        // Date format: YYYY-MM-DD HH:MM:SS - we preserve the time component to avoid drift
        // daysDifference can be positive (adding days) or negative (removing days)
        if (rotation && rotation.id) {
          try {
            // CRITICAL: Store the ORIGINAL end_date BEFORE updating
            // We need this to find upcoming rotations correctly
            const originalEndDate = normalizeDbDate(rotation.end_date);
            const originalEndStr = originalEndDate ? format(originalEndDate, 'yyyy-MM-dd') : null;
            
            // Use SQL date arithmetic for PostgreSQL updates
            let updateQuery;
            const absDays = Math.abs(daysDifference);
            const isAdding = daysDifference > 0;
            
            if (isAdding) {
              updateQuery = `
                UPDATE rotations 
                SET end_date = end_date + INTERVAL '${absDays} days',
                    is_manual_assignment = TRUE
                WHERE id = $1
              `;
            } else {
              updateQuery = `
                UPDATE rotations 
                SET end_date = end_date - INTERVAL '${absDays} days',
                    is_manual_assignment = TRUE
                WHERE id = $1
              `;
            }
            
            console.log(`[ExtendInternship] ${isAdding ? 'Extending' : 'Reducing'} rotation ${rotation.id} by ${absDays} day(s) (difference: ${daysDifference})`);
            console.log(`[ExtendInternship] Original end_date: ${rotation.end_date}`);
            console.log(`[ExtendInternship] Update query: ${updateQuery.trim()}`);
            
            const updateResult = await runAsync(
              updateQuery,
              [rotation.id]
            );
            
            if (updateResult.changes > 0) {
              console.log(`[ExtendInternship] ✅ Rotation ${rotation.id} updated successfully, changes: ${updateResult.changes}`);
              
              // CRITICAL: Verify the update was actually saved
              const verifyRotation = await getAsync(
                'SELECT id, end_date, start_date, unit_id FROM rotations WHERE id = ?',
                [rotation.id]
              );
              if (verifyRotation) {
                console.log(`[ExtendInternship] ✅ Verified rotation ${rotation.id} now ends on ${verifyRotation.end_date} (was ${rotation.end_date})`);
                
                // AUTOMATED: Shift all upcoming rotations by the same amount
                // This ensures the schedule remains consistent when extension days change
                // IMPORTANT: Use the ORIGINAL end_date to find upcoming rotations, not the updated one
                // This ensures we catch the first upcoming rotation that starts on the day after the original end date
                try {
                  if (originalEndDate && originalEndStr) {
                    // Find all rotations that start on or after the day after the ORIGINAL end date
                    // This catches the first upcoming rotation that starts immediately after the current rotation
                    const dayAfterOriginalEnd = addDays(originalEndDate, 1);
                    const dayAfterOriginalEndStr = format(dayAfterOriginalEnd, 'yyyy-MM-dd');
                    
                    const upcomingRotations = await allAsync(
                      `SELECT id, start_date, end_date, unit_id 
                       FROM rotations 
                       WHERE intern_id = ? 
                       AND id != ?
                       AND start_date >= ? 
                       ORDER BY start_date ASC`,
                      [id, rotation.id, dayAfterOriginalEndStr]
                    );
                    
                    if (upcomingRotations.length > 0) {
                      console.log(`[ExtendInternship] Found ${upcomingRotations.length} upcoming rotation(s) to shift by ${daysDifference} day(s)`);
                      
                      // Shift each upcoming rotation forward (or backward) by daysDifference
                      for (const upcomingRot of upcomingRotations) {
                        try {
                          let shiftQuery;
                          if (isPostgres) {
                            if (isAdding) {
                              shiftQuery = `
                                UPDATE rotations 
                                SET start_date = start_date + INTERVAL '${absDays} days',
                                    end_date = end_date + INTERVAL '${absDays} days'
                                WHERE id = $1
                              `;
                            } else {
                              shiftQuery = `
                                UPDATE rotations 
                                SET start_date = start_date - INTERVAL '${absDays} days',
                                    end_date = end_date - INTERVAL '${absDays} days'
                                WHERE id = $1
                              `;
                            }
                          } else {
                            if (isAdding) {
                              shiftQuery = `
                                UPDATE rotations 
                                SET start_date = datetime(start_date, '+${absDays} days'),
                                    end_date = datetime(end_date, '+${absDays} days')
                                WHERE id = ?
                              `;
                            } else {
                              shiftQuery = `
                                UPDATE rotations 
                                SET start_date = datetime(start_date, '-${absDays} days'),
                                    end_date = datetime(end_date, '-${absDays} days')
                                WHERE id = ?
                              `;
                            }
                          }
                          
                          const shiftResult = await runAsync(shiftQuery, [upcomingRot.id]);
                          if (shiftResult.changes > 0) {
                            console.log(`[ExtendInternship] ✅ Shifted upcoming rotation ${upcomingRot.id} (unit ${upcomingRot.unit_id}) by ${daysDifference} day(s)`);
                          }
                        } catch (shiftErr) {
                          console.error(`[ExtendInternship] ⚠️ Error shifting rotation ${upcomingRot.id}:`, shiftErr);
                          // Continue with other rotations even if one fails
                        }
                      }
                      
                      console.log(`[ExtendInternship] ✅ Completed shifting ${upcomingRotations.length} upcoming rotation(s)`);
                    } else {
                      console.log(`[ExtendInternship] No upcoming rotations to shift`);
                    }
                  }
                } catch (shiftAllErr) {
                  console.error(`[ExtendInternship] ⚠️ Error shifting upcoming rotations (non-critical):`, shiftAllErr);
                  // Don't fail the entire request if shifting upcoming rotations fails
                }
              } else {
                console.error(`[ExtendInternship] ❌ Could not verify rotation ${rotation.id} after update`);
              }
            } else {
              console.error(`[ExtendInternship] ❌ Rotation update returned 0 changes - rotation may not exist or was not updated`);
              // Try to fetch the rotation to see if it exists
              const checkRotation = await getAsync('SELECT id, end_date FROM rotations WHERE id = ?', [rotation.id]);
              if (checkRotation) {
                console.error(`[ExtendInternship] Rotation ${rotation.id} exists but update failed. Current end_date: ${checkRotation.end_date}`);
              } else {
                console.error(`[ExtendInternship] Rotation ${rotation.id} does not exist in database`);
              }
            }
          } catch (updateErr) {
            console.error(`[ExtendInternship] ❌ Error updating rotation:`, updateErr);
            console.error(`[ExtendInternship] Error stack:`, updateErr.stack);
            throw updateErr; // Re-throw to be caught by outer catch
          }
        } else {
          // CRITICAL: If unit_id was provided but no rotation found, this is an error
          if (unit_id) {
            console.error(`[ExtendInternship] ❌ ERROR: unit_id provided (${unit_id}) but no rotation found for intern ${id}`);
            try {
              const debugRotations = await allAsync(
                `SELECT id, unit_id, start_date, end_date FROM rotations WHERE intern_id = ? ORDER BY end_date DESC`,
                [id]
              );
              console.error(`[ExtendInternship] Available rotations for intern ${id}:`, JSON.stringify(debugRotations, null, 2));
            } catch (debugErr) {
              console.error(`[ExtendInternship] Error fetching debug rotations:`, debugErr);
            }
            console.error(`[ExtendInternship] Extension days recorded (${extension_days}) but rotation NOT updated!`);
          } else {
            console.warn(`[ExtendInternship] ⚠️ No rotation found for intern ${id} (no unit_id provided), extension days will still be recorded`);
          }
        }
      } catch (rotationUpdateErr) {
        console.error(`[ExtendInternship] Error in rotation update logic:`, rotationUpdateErr);
        // Don't fail the entire request - extension days are still recorded
        // The rotation update can be retried later if needed
      }
    }

    // Record extension reason (non-blocking - don't fail if this fails)
    const daysToRecord = typeof adjustment_days === 'number' ? adjustment_days : extension_days;
    try {
      await runAsync(
        `
          INSERT INTO extension_reasons (intern_id, extension_days, reason, notes)
          VALUES (?, ?, ?, ?)
        `,
        [id, daysToRecord, reason, notes || '']
      );
      console.log(`[ExtendInternship] ✅ Extension reason recorded for intern ${id}`);
    } catch (reasonErr) {
      console.error(`[ExtendInternship] ⚠️ Failed to record extension reason (non-critical):`, reasonErr);
      // Don't fail the entire request if recording reason fails
    }

    // Get updated rotation info if it was modified
    let updatedRotation = null;
    if (daysDifference !== 0 && unit_id) {
      try {
        updatedRotation = await getAsync(
          `SELECT id, start_date, end_date, unit_id FROM rotations WHERE intern_id = ? AND unit_id = ? ORDER BY end_date DESC LIMIT 1`,
          [id, unit_id]
        );
        if (updatedRotation) {
          console.log(`[ExtendInternship] ✅ Returning updated rotation info: ${updatedRotation.start_date} to ${updatedRotation.end_date}`);
        }
      } catch (err) {
        console.error(`[ExtendInternship] Error fetching updated rotation:`, err);
      }
    }

    // Ensure intern status is correct after extension
    try {
      await ensureInternStatusIsCorrect(id);
    } catch (statusErr) {
      console.error(`[ExtendInternship] Error updating intern status:`, statusErr);
      // Don't fail the request if status update fails
    }

    // Log activity
    try {
      const intern = await getAsync('SELECT name FROM interns WHERE id = ?', [id]);
      const unit = unit_id ? await getAsync('SELECT name FROM units WHERE id = ?', [unit_id]) : null;
      const actionText = daysDifference > 0 
        ? `Extended by ${daysDifference} day(s)` 
        : `Extension reduced by ${Math.abs(daysDifference)} day(s)`;
      
      // Create clear message with intern name and unit
      const internName = intern?.name || 'An intern';
      const unitName = unit?.name || 'current unit';
      const detailsMessage = `${internName}'s rotation in ${unitName} was ${actionText.toLowerCase()}${reason ? ` (${reason})` : ''}`;
      
      await logActivity('extension', {
        internId: id,
        internName: intern?.name || null,
        unitId: unit_id || null,
        unitName: unit?.name || null,
        details: detailsMessage
      });
      await logRecentUpdateSafe(
        'intern_extended',
        `${internName} rotation extended by ${Math.abs(daysDifference)} day(s).`
      );
    } catch (logErr) {
      console.error(`[ExtendInternship] Error logging activity:`, logErr);
    }

    res.json({
      message: extension_days > 0 ? 'Internship extended successfully' : 'Extension removed successfully',
      extension_days,
      adjustment_days: typeof adjustment_days === 'number' ? adjustment_days : null,
      reason,
      notes,
      unit_id: unit_id || null,
      status: finalStatus,
      rotation: updatedRotation ? {
        id: updatedRotation.id,
        start_date: updatedRotation.start_date,
        end_date: updatedRotation.end_date,
        unit_id: updatedRotation.unit_id
      } : null
    });
  } catch (error) {
    console.error('[ExtendInternship] Error processing extension:', error);
    console.error('[ExtendInternship] Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to extend internship',
      details: error.message || String(error),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/interns/activities/recent - Get recent activities
router.get('/activities/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 20, 10);
    const activities = await allAsync(
      `SELECT 
        id,
        activity_type,
        intern_id,
        intern_name,
        unit_id,
        unit_name,
        details,
        created_at
       FROM activity_log
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
    
    res.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// DELETE /api/interns/:id - Delete intern
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const intern = await getAsync('SELECT name FROM interns WHERE id = ?', [id]);
    if (!intern) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const result = await runAsync('DELETE FROM interns WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    await logRecentUpdateSafe('intern_deleted', `Intern ${intern.name} was deleted.`);
    res.json({ message: 'Intern deleted successfully' });
  } catch (err) {
    console.error('Error deleting intern:', err);
    res.status(500).json({ error: 'Failed to delete intern' });
  }
});

// GET /api/interns/:id/schedule - Get intern's rotation schedule
router.get('/:id/schedule', async (req, res) => {
  const { id } = req.params;
  
  // Ensure status is correct first
  await ensureInternStatusIsCorrect(id).catch(err => {
    console.error(`[schedule] Error ensuring status for intern ${id}:`, err);
  });
  
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
  
  try {
    const rotationsQuery = `
      SELECT 
        r.*,
        u.name as unit_name,
        u.duration_days,
        u.workload
      FROM rotations r
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE r.intern_id = ?
      ORDER BY r.start_date
    `;

    const unitsQuery = `
      SELECT id, name, duration_days, workload, position
      FROM units
      ORDER BY COALESCE(position, 2147483647) ASC, id ASC
    `;

    const [rotations, units] = await Promise.all([
      allAsync(rotationsQuery, [id]),
      allAsync(unitsQuery, []),
    ]);

    const schedule = buildInternSchedule({
      internId: Number(id),
      rotations,
      orderedUnits: units,
    });

    res.json(schedule);
  } catch (err) {
    console.error('Error fetching schedule:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// POST /api/interns/:id/force-auto-advance - Manually trigger auto-advance (for testing/debugging)
router.post('/:id/force-auto-advance', async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log(`[ForceAutoAdvance] Manually triggering auto-advance for intern ${id}`);
    const result = await autoAdvanceInternRotation(id);
    await logRecentUpdateSafe('rotation_auto_advance', `Manual auto-advance triggered for intern ${id}.`);
    
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

// Helper function to ensure intern status is correct based on current rotations
// Status should be Active/Extended while in rotations, Completed only when all units done and no active/upcoming rotations
async function ensureInternStatusIsCorrect(internId) {
  try {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const today = format(todayUTC, 'yyyy-MM-dd');
    
    // Get intern
    const intern = await getAsync(
      `SELECT * FROM interns WHERE id = ?`,
      [internId]
    );
    
    if (!intern) return;
    
    // Get all units
    const units = await allAsync('SELECT * FROM units ORDER BY COALESCE(position, 2147483647), id ASC', []);
    if (units.length === 0) return;
    
    // Get all rotations for this intern
    const allRotations = await allAsync(
      `SELECT * FROM rotations WHERE intern_id = ? ORDER BY start_date ASC`,
      [internId]
    );
    
    // Check for active or upcoming rotations
    const hasActiveOrUpcomingRotations = allRotations.some(r => {
      if (!r.start_date || !r.end_date) return false;
      const startDate = parseDateSafe(r.start_date);
      const endDate = parseDateSafe(r.end_date);
      if (!startDate || !endDate) return false;
      
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');
      
      // Current rotation (today is between start and end)
      if (startStr <= today && endStr >= today) return true;
      
      // Upcoming rotation (start date is after today)
      if (startStr > today) return true;
      
      return false;
    });
    
    // Check if all units are completed (only count automatic rotations that have ENDED)
    // IMPORTANT: Only count rotations that ended in the past
    // This ensures reassigned units aren't counted as "completed"
    const todayStr = format(todayUTC, 'yyyy-MM-dd');
    const automaticRotations = allRotations.filter(r => {
      if (r.is_manual_assignment) return false;
      const endDate = parseDateSafe(r.end_date);
      if (!endDate) return false;
      const endStr = format(endDate, 'yyyy-MM-dd');
      return endStr < todayStr; // Only count rotations that ended in the past
    });
    const completedUnits = new Set(automaticRotations.map(r => r.unit_id));
    const allUnitsCompleted = completedUnits.size >= units.length;
    
    // Determine correct status
    let correctStatus = intern.status;
    
    if (hasActiveOrUpcomingRotations) {
      // Has active/upcoming rotations - should be Active or Extended
      correctStatus = intern.extension_days > 0 ? 'Extended' : 'Active';
    } else if (allUnitsCompleted) {
      // All units done and no active/upcoming rotations - should be Completed
      // But keep Extended if they have extension_days (might be in extension period)
      if (intern.extension_days > 0) {
        correctStatus = 'Extended';
      } else {
        correctStatus = 'Completed';
      }
    } else {
      // Not all units done - should be Active or Extended
      correctStatus = intern.extension_days > 0 ? 'Extended' : 'Active';
    }
    
    // Update status if it's incorrect
    if (correctStatus !== intern.status) {
      console.log(`[ensureInternStatus] Correcting intern ${internId} status from "${intern.status}" to "${correctStatus}"`);
      await runAsync(
        'UPDATE interns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [correctStatus, internId]
      );
      if (correctStatus === 'Completed') {
        await logRecentUpdateSafe('intern_completed', `Intern ${intern.name} has completed all rotations.`);
      }
    }
  } catch (err) {
    console.error(`[ensureInternStatus] Error correcting status for intern ${internId}:`, err);
  }
}

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
    db.all('SELECT * FROM units ORDER BY COALESCE(position, 2147483647), id ASC', [], (err, rows) => {
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

  // Check if intern has completed all units AND has no active/upcoming rotations
  const automaticRotations = sortedRotations.filter(r => !r.is_manual_assignment);
  const completedUnits = new Set(automaticRotations.map(r => r.unit_id));
  
  // Check for current or upcoming rotations (intern is still active)
  const hasActiveOrUpcomingRotations = sortedRotations.some(r => {
    if (!r.start_date || !r.end_date) return false;
    const startDate = parseDateSafe(r.start_date);
    const endDate = parseDateSafe(r.end_date);
    if (!startDate || !endDate) return false;
    
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    // Current rotation (today is between start and end)
    if (startStr <= today && endStr >= today) return true;
    
    // Upcoming rotation (start date is after today)
    if (startStr > today) return true;
    
    return false;
  });
  
  // Only mark as Completed if:
  // 1. All units are completed
  // 2. No active or upcoming rotations (internship is truly finished)
  if (completedUnits.size >= units.length && !hasActiveOrUpcomingRotations) {
    console.log(`[AutoAdvance] Intern ${internId} has completed all ${units.length} units and has no active/upcoming rotations`);
    
    // Mark intern as Completed only if status isn't already Extended
    if (intern.status !== 'Extended') {
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE interns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['Completed', internId],
          function(err) {
            if (err) {
              console.error(`[AutoAdvance] Error marking intern ${internId} as Completed:`, err);
              reject(err);
            } else {
              console.log(`[AutoAdvance] ✅ Intern ${internId} marked as Completed`);
              resolve();
            }
          }
        );
      });
      await logRecentUpdateSafe('intern_completed', `Intern ${intern.name} has completed all rotations.`);
    }
    
    return false; // Stop creating new rotations
  }
  
  // If intern has active/upcoming rotations but status is Completed, set back to Active
  if (hasActiveOrUpcomingRotations && intern.status === 'Completed') {
    const newStatus = intern.extension_days > 0 ? 'Extended' : 'Active';
    console.log(`[AutoAdvance] Intern ${internId} has active/upcoming rotations, updating status from Completed to ${newStatus}`);
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE interns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newStatus, internId],
        function(err) {
          if (err) {
            console.error(`[AutoAdvance] Error updating intern ${internId} status:`, err);
            reject(err);
          } else {
            console.log(`[AutoAdvance] ✅ Intern ${internId} status updated to ${newStatus}`);
            resolve();
          }
        }
      );
    });
  }
  
  // Use flexible, fair round-robin logic to get next unit
  const { getNextUnitForIntern: getNextUnit } = getRotationHelpers();
  const nextUnit = await getNextUnit(internId, units, allInterns, lastRotation);
  
  if (!nextUnit) {
    console.warn(`[AutoAdvance] No available unit for intern ${internId}`);
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
            console.error(`[AutoAdvance] Error creating rotation for intern ${internId}:`, err);
            reject(err);
          } else {
            console.log(`[AutoAdvance] Created automatic rotation: ${nextUnit.name} from ${nextStartDateStr} to ${nextEndDateStr}`);
            resolve();
          }
        }
      );
    });
    
    // Note: We don't mark as Completed here anymore
    // Status is only set to Completed when there are no active/upcoming rotations
    // This happens in the check above before creating new rotations

    return true;
  } catch (err) {
    console.error(`[AutoAdvance] Exception creating rotation for intern ${internId}:`, err);
    return false;
  }

}

// Helper function to generate rotations for a new intern (called asynchronously)
async function generateRotationsForIntern(internId, batch, start_date) {
  try {
    console.log(`[GenerateRotations] STARTING for intern ${internId} (batch=${batch}, start_date=${start_date})`);
    
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
    
    console.log(`[GenerateRotations] Found ${allInterns.length} active/extended interns`);
    
    // Find the new intern's index for fallback round-robin assignment
    const internIndex = allInterns.findIndex(i => i.id === internId);
    if (internIndex === -1) {
      console.error(`[GenerateRotations] ❌ Intern ${internId} not found in active interns list`);
      return;
    }
    
    console.log(`[GenerateRotations] Intern ${internId} is at index ${internIndex}`);
    
    // Get all units ordered by ID for consistent round-robin sequence
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM units ORDER BY COALESCE(position, 2147483647), id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    console.log(`[GenerateRotations] Found ${units.length} units: ${units.map(u => u.name).join(', ')}`);
    
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
    
    console.log(`[GenerateRotations] Settings loaded: ${Object.keys(settings).join(', ')}`);
    
    if (units.length === 0) {
      console.warn('[GenerateRotations] ⚠️ No units available, skipping rotation creation');
      return;
    }

    let startOffset = internIndex % units.length;
    let roundRobinCounter;

    try {
      const { getRoundRobinCounter: getCounter } = getRotationHelpers();
      roundRobinCounter = await getCounter();
      startOffset = roundRobinCounter % units.length;
      console.log(`[GenerateRotations] Round-robin counter: ${roundRobinCounter}, start offset: ${startOffset}`);
    } catch (counterErr) {
      console.error('[GenerateRotations] Failed to read round robin counter, using intern index fallback:', counterErr);
      roundRobinCounter = null;
    }

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
      startOffset
    );
    
    console.log(`[GenerateRotations] Generated ${rotations.length} rotations for intern ${internId}`);
    rotations.forEach((rot, idx) => {
      console.log(`  Rotation ${idx + 1}: Unit ID ${rot.unit_id}, ${rot.start_date} to ${rot.end_date}`);
    });
    
    // Insert generated rotations
    let insertedCount = 0;
    for (const rotation of rotations) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO rotations (intern_id, unit_id, start_date, end_date, is_manual_assignment)
           VALUES (?, ?, ?, ?, FALSE)`,
          [rotation.intern_id, rotation.unit_id, rotation.start_date, rotation.end_date],
          (err) => {
            if (err) {
              console.error(`[GenerateRotations] ❌ Error inserting rotation:`, err);
              reject(err);
            } else {
              insertedCount++;
              resolve();
            }
          }
        );
      });
    }

    console.log(`[GenerateRotations] ✅ Successfully inserted ${insertedCount}/${rotations.length} rotations for intern ${internId}`);

    if (roundRobinCounter !== null) {
      try {
        const { setRoundRobinCounter: setCounter } = getRotationHelpers();
        await setCounter(roundRobinCounter + 1);
        console.log(`[GenerateRotations] Updated round-robin counter to ${roundRobinCounter + 1}`);
      } catch (counterErr) {
        console.error('[GenerateRotations] Failed to advance round robin counter after creating rotations:', counterErr);
      }
    }
    
    console.log(`[GenerateRotations] ✅ COMPLETED for intern ${internId}`);
  } catch (genErr) {
    console.error('[GenerateRotations] ❌ FATAL ERROR auto-generating rotations:', genErr);
    console.error('[GenerateRotations] Error message:', genErr.message);
    console.error('[GenerateRotations] Stack trace:', genErr.stack);
    // Don't fail intern creation if rotation generation fails
  }
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
