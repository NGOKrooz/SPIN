const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/dbWrapper');

const router = express.Router();

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

// Validation middleware
const validateUnit = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('duration_days').isInt({ min: 1, max: 365 }).withMessage('Duration must be 1-365 days'),
  body('workload').optional().isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High'),
  body('patient_count').optional().isInt({ min: 0 }).withMessage('Patient count must be a non-negative integer')
];

// GET /api/units - Get all units
router.get('/', (req, res) => {
  const query = `
    SELECT 
      u.*,
      COUNT(r.id) as current_interns,
      GROUP_CONCAT(
        CASE 
          WHEN r.start_date <= date('now') AND r.end_date >= date('now') 
          THEN i.name || ' (' || i.batch || ')'
          ELSE NULL 
        END, ', '
      ) as intern_names
    FROM units u
    LEFT JOIN rotations r ON u.id = r.unit_id 
      AND r.start_date <= date('now') 
      AND r.end_date >= date('now')
    LEFT JOIN interns i ON r.intern_id = i.id
    GROUP BY u.id
    ORDER BY COALESCE(u.sort_order, 9999), u.name
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching units:', err);
      return res.status(500).json({ error: 'Failed to fetch units' });
    }
    
    const units = rows.map(row => {
      // Auto-calculate workload based on patient count if available
      let workload = row.workload;
      if (row.patient_count && row.patient_count > 0) {
        if (row.patient_count <= 4) {
          workload = 'Low';
        } else if (row.patient_count <= 8) {
          workload = 'Medium';
        } else {
          workload = 'High';
        }
      } else {
        // Default to Low if no patient count is set
        workload = 'Low';
      }
      
      return {
        ...row,
        workload: workload,
        current_interns: parseInt(row.current_interns) || 0,
        intern_names: row.intern_names ? row.intern_names.split(', ') : [],
        coverage_status: getCoverageStatus(row.current_interns, workload)
      };
    });
    
    res.json(units);
  });
});

// PUT /api/units/order - Update ordering for units
router.put('/order', (req, res) => {
  const { order } = req.body; // expect array of unit ids in desired order
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Order must be an array of unit ids' });
  }

  // Use transaction-like serialize for SQLite
  db.serialize(() => {
    try {
      const stmt = db.prepare(`UPDATE units SET sort_order = ? WHERE id = ?`);
      order.forEach((id, idx) => {
        stmt.run(idx + 1, id);
      });
      stmt.finalize((err) => {
        if (err) {
          console.error('Error saving unit order:', err);
          return res.status(500).json({ error: 'Failed to save unit order' });
        }
        res.json({ message: 'Unit order updated' });
      });
    } catch (err) {
      console.error('Error updating unit order:', err);
      return res.status(500).json({ error: 'Failed to update unit order' });
    }
  });
});

// GET /api/units/:id - Get specific unit
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT 
      u.*,
      r.id as rotation_id,
      r.start_date,
      r.end_date,
      r.is_manual_assignment,
      i.name as intern_name,
      i.batch as intern_batch,
      i.id as intern_id
    FROM units u
    LEFT JOIN rotations r ON u.id = r.unit_id
    LEFT JOIN interns i ON r.intern_id = i.id
    WHERE u.id = ?
    ORDER BY r.start_date DESC
  `;
  
  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching unit:', err);
      return res.status(500).json({ error: 'Failed to fetch unit' });
    }
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    const unit = {
      ...rows[0],
      current_rotations: rows
        .filter(row => row.rotation_id)
        .map(row => ({
          id: row.rotation_id,
          intern_id: row.intern_id,
          intern_name: row.intern_name,
          intern_batch: row.intern_batch,
          start_date: row.start_date,
          end_date: row.end_date,
          is_manual_assignment: row.is_manual_assignment
        }))
    };
    
    // Remove rotation fields from main unit object
    delete unit.rotation_id;
    delete unit.start_date;
    delete unit.end_date;
    delete unit.is_manual_assignment;
    delete unit.intern_name;
    delete unit.intern_batch;
    delete unit.intern_id;
    
    res.json(unit);
  });
});

// POST /api/units - Create new unit
router.post('/', validateUnit, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { name, duration_days, workload, description, patient_count } = req.body;

  // Derive workload from patient_count if not provided
  let finalWorkload = workload;
  const count = typeof patient_count === 'number' ? patient_count : parseInt(patient_count || '0');
  if (!finalWorkload) {
    if (count <= 4) finalWorkload = 'Low';
    else if (count <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }
  
  const query = `
    INSERT INTO units (name, duration_days, workload, description, patient_count)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(query, [name, duration_days, finalWorkload, description, count || 0], function(err) {
    if (err) {
      console.error('Error creating unit:', err);
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Unit name already exists' });
      }
      return res.status(500).json({ error: 'Failed to create unit' });
    }
    
    res.status(201).json({
      id: this.lastID,
      name,
      duration_days,
      workload: finalWorkload,
      description,
      patient_count: count || 0
    });
  });
});

// POST /api/units/seed-defaults - Seed default units (idempotent)
router.post('/seed-defaults', async (req, res) => {

  // Use a function to handle INSERT OR IGNORE for both SQLite and PostgreSQL
  const insertUnit = async (unit) => {
    return new Promise((resolve, reject) => {
      // Calculate workload from patient_count
      let workload;
      if (unit.patient_count <= 4) workload = 'Low';
      else if (unit.patient_count <= 8) workload = 'Medium';
      else workload = 'High';
      
      const query = isPostgres 
        ? `INSERT INTO units (name, duration_days, workload, description, patient_count, sort_order) VALUES ($1, $2, $3, '', $4, $5) ON CONFLICT (name) DO NOTHING`
        : `INSERT OR IGNORE INTO units (name, duration_days, workload, description, patient_count, sort_order) VALUES (?, ?, ?, '', ?, ?)`;
      
      const params = isPostgres 
        ? [unit.name, unit.duration_days, workload, unit.patient_count, unit.sort_order] 
        : [unit.name, unit.duration_days, workload, unit.patient_count, unit.sort_order];
      
      db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
  
  const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : (process.env.DB_TYPE || 'sqlite');
  const isPostgres = DB_TYPE === 'postgres';
  
  // Use prepared statement for SQLite, direct queries for PostgreSQL
  if (isPostgres) {
    try {
      for (const unit of defaultUnits) {
        await insertUnit(unit);
      }
      res.json({ message: 'Default units seeded (idempotent)' });
    } catch (err) {
      console.error('Error seeding units:', err);
      return res.status(500).json({ error: 'Failed to seed units' });
    }
    return;
  }
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO units (name, duration_days, workload, description, patient_count, sort_order)
    VALUES (?, ?, ?, '', ?, ?)
  `);

  db.serialize(() => {
    try {
      defaultUnits.forEach(u => {
        // Calculate workload from patient_count
        let workload;
        if (u.patient_count <= 4) workload = 'Low';
        else if (u.patient_count <= 8) workload = 'Medium';
        else workload = 'High';
        
        stmt.run(u.name, u.duration_days, workload, u.patient_count, u.sort_order);
      });
      stmt.finalize((err) => {
        if (err) {
          console.error('Error seeding units:', err);
          return res.status(500).json({ error: 'Failed to seed units' });
        }
        res.json({ message: 'Default units seeded (idempotent)' });
      });
    } catch (e) {
      console.error('Seed error:', e);
      return res.status(500).json({ error: 'Failed to seed units' });
    }
  });
});

// PUT /api/units/:id - Update unit
router.put('/:id', validateUnit, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { name, duration_days, workload, description, patient_count } = req.body;

  // Derive workload from patient_count if not provided
  let finalWorkload = workload;
  const count = typeof patient_count === 'number' ? patient_count : parseInt(patient_count || '0');
  if (!finalWorkload) {
    if (count <= 4) finalWorkload = 'Low';
    else if (count <= 8) finalWorkload = 'Medium';
    else finalWorkload = 'High';
  }
  
  const query = `
    UPDATE units 
    SET name = ?, duration_days = ?, workload = ?, description = ?, patient_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  db.run(query, [name, duration_days, finalWorkload, description, count || 0, id], function(err) {
    if (err) {
      console.error('Error updating unit:', err);
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Unit name already exists' });
      }
      return res.status(500).json({ error: 'Failed to update unit' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ message: 'Unit updated successfully' });
  });
});

// POST /api/units/:id/workload - Update unit workload
router.post('/:id/workload', [
  body('workload').isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High'),
  body('week_start_date').isISO8601().withMessage('Week start date must be valid'),
  body('notes').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { workload, week_start_date, notes } = req.body;
  
  // Update current workload
  const updateQuery = `
    UPDATE units 
    SET workload = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  // Insert workload history
  const historyQuery = `
    INSERT INTO workload_history (unit_id, workload, week_start_date, notes)
    VALUES (?, ?, ?, ?)
  `;
  
  db.serialize(() => {
    db.run(updateQuery, [workload, id], function(err) {
      if (err) {
        console.error('Error updating workload:', err);
        return res.status(500).json({ error: 'Failed to update workload' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      
      // Insert into history
      db.run(historyQuery, [id, workload, week_start_date, notes], function(err) {
        if (err) {
          console.error('Error saving workload history:', err);
          return res.status(500).json({ error: 'Failed to save workload history' });
        }
        
        res.json({ message: 'Workload updated successfully' });
      });
    });
  });
});

// POST /api/units/:id/patient-count - Update patient count and auto-calculate workload
router.post('/:id/patient-count', [
  body('patient_count').isInt({ min: 0 }).withMessage('Patient count must be a non-negative integer')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { patient_count } = req.body;
  
  // Auto-calculate workload based on patient count
  let workload;
  if (patient_count <= 4) {
    workload = 'Low';
  } else if (patient_count <= 8) {
    workload = 'Medium';
  } else {
    workload = 'High';
  }
  
  // Update patient count and workload
  const updateQuery = `
    UPDATE units 
    SET patient_count = ?, workload = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  // Insert workload history
  const historyQuery = `
    INSERT INTO workload_history (unit_id, workload, week_start_date, notes)
    VALUES (?, ?, ?, ?)
  `;
  
  const weekStartDate = new Date().toISOString().split('T')[0];
  const notes = `Auto-calculated from ${patient_count} patients`;
  
  db.serialize(() => {
    db.run(updateQuery, [patient_count, workload, id], function(err) {
      if (err) {
        console.error('Error updating patient count:', err);
        return res.status(500).json({ error: 'Failed to update patient count' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      
      // Insert into history
      db.run(historyQuery, [id, workload, weekStartDate, notes], function(err) {
        if (err) {
          console.error('Error saving workload history:', err);
          return res.status(500).json({ error: 'Failed to save workload history' });
        }
        
        res.json({ 
          message: 'Patient count and workload updated successfully',
          workload: workload,
          patient_count: patient_count
        });
      });
    });
  });
});

// GET /api/units/:id/workload-history - Get workload history
router.get('/:id/workload-history', (req, res) => {
  const { id } = req.params;
  const { limit = 12 } = req.query;
  
  const query = `
    SELECT * FROM workload_history
    WHERE unit_id = ?
    ORDER BY week_start_date DESC
    LIMIT ?
  `;
  
  db.all(query, [id, limit], (err, rows) => {
    if (err) {
      console.error('Error fetching workload history:', err);
      return res.status(500).json({ error: 'Failed to fetch workload history' });
    }
    
    res.json(rows);
  });
});

// GET /api/units/:id/completed-interns - Get completed interns for a unit
router.get('/:id/completed-interns', (req, res) => {
  const { id } = req.params;
  
  // dbWrapper automatically converts date('now') to CURRENT_DATE for PostgreSQL
  const query = `
    SELECT 
      r.id as rotation_id,
      r.start_date,
      r.end_date,
      i.id as intern_id,
      i.name as intern_name,
      i.batch as intern_batch,
      i.status as intern_status
    FROM rotations r
    JOIN interns i ON r.intern_id = i.id
    WHERE r.unit_id = ?
      AND r.end_date < date('now')
    ORDER BY r.end_date DESC
  `;
  
  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching completed interns:', err);
      return res.status(500).json({ error: 'Failed to fetch completed interns' });
    }
    
    res.json(rows || []);
  });
});

// DELETE /api/units/:id - Delete unit
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  // Check if unit has active rotations
  const checkQuery = `
    SELECT COUNT(*) as count FROM rotations 
    WHERE unit_id = ? AND end_date >= date('now')
  `;
  
  db.get(checkQuery, [id], (err, row) => {
    if (err) {
      console.error('Error checking unit usage:', err);
      return res.status(500).json({ error: 'Failed to check unit usage' });
    }
    
    if (row.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete unit with active rotations' 
      });
    }
    
    const deleteQuery = 'DELETE FROM units WHERE id = ?';
    
    db.run(deleteQuery, [id], function(err) {
      if (err) {
        console.error('Error deleting unit:', err);
        return res.status(500).json({ error: 'Failed to delete unit' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }
      
      res.json({ message: 'Unit deleted successfully' });
    });
  });
});

// Helper function to determine coverage status
function getCoverageStatus(currentInterns, workload) {
  const internCount = parseInt(currentInterns) || 0;
  
  // Units with 0 interns require immediate attention - should be critical
  if (internCount === 0) {
    return 'critical';
  }
  
  // Updated coverage requirements based on workload
  if (workload === 'High' && internCount < 2) {
    return 'critical';
  } else if (workload === 'Medium' && internCount < 2) {
    return 'critical';
  } else if (workload === 'Low' && internCount < 1) {
    return 'warning';
  } else {
    return 'good';
  }
}

module.exports = router;
