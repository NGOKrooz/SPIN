const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database/init');

const router = express.Router();
const db = getDatabase();

// Validation middleware
const validateUnit = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('duration_days').isInt({ min: 1, max: 365 }).withMessage('Duration must be 1-365 days'),
  body('workload').isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High')
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
    ORDER BY u.name
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching units:', err);
      return res.status(500).json({ error: 'Failed to fetch units' });
    }
    
    const units = rows.map(row => ({
      ...row,
      current_interns: parseInt(row.current_interns) || 0,
      intern_names: row.intern_names ? row.intern_names.split(', ') : [],
      coverage_status: getCoverageStatus(row.current_interns, row.workload)
    }));
    
    res.json(units);
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
  
  const { name, duration_days, workload, description } = req.body;
  
  const query = `
    INSERT INTO units (name, duration_days, workload, description)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(query, [name, duration_days, workload, description], function(err) {
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
      workload,
      description
    });
  });
});

// PUT /api/units/:id - Update unit
router.put('/:id', validateUnit, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  const { id } = req.params;
  const { name, duration_days, workload, description } = req.body;
  
  const query = `
    UPDATE units 
    SET name = ?, duration_days = ?, workload = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  db.run(query, [name, duration_days, workload, description, id], function(err) {
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
  
  if (workload === 'High' && internCount < 2) {
    return 'critical';
  } else if (workload === 'Medium' && internCount < 1) {
    return 'warning';
  } else if (workload === 'Low' && internCount < 1) {
    return 'warning';
  } else {
    return 'good';
  }
}

module.exports = router;
