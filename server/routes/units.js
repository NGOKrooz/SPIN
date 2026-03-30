const express = require('express');
const { body, validationResult } = require('express-validator');

const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');
const { createUnit, updateUnit, deleteUnit, calculateWorkload, isCritical } = require('../services/unitService');
const { ACTIVITY_TYPES, logActivityEventSafe, logRecentUpdateSafe } = require('../services/recentUpdatesService');
const { buildInternViews } = require('../services/internViewService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

const normalizeUnitPayload = (req, res, next) => {
  // Support both camelCase and snake_case payloads (frontend may send snake_case)
  if (req.body.duration_days !== undefined && req.body.durationDays === undefined) {
    req.body.durationDays = req.body.duration_days;
  }
  if (req.body.patient_count !== undefined && req.body.patientCount === undefined) {
    req.body.patientCount = req.body.patient_count;
  }
  next();
};

const validateUnitPayload = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Unit name must be 2-100 characters'),
  body('durationDays').optional().isInt({ min: 1, max: 365 }).withMessage('Duration must be 1-365 days'),
  body('workload').optional().isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High'),
  body('patientCount').optional().isInt({ min: 0 }).withMessage('Patient count must be a non-negative integer'),
];

function areValuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function getComparableUnitValue(unit, field) {
  if (!unit) return null;

  if (field === 'durationDays') {
    return unit.durationDays ?? unit.duration ?? null;
  }

  return unit[field] ?? null;
}

// GET /api/units - Get all units
router.get('/', async (req, res) => {
  try {
    const units = await Unit.find({}).sort({ order: 1, name: 1 }).exec();

    // Count current active interns per unit (today)
    const today = new Date();
    const activeRotations = await Rotation.find({
      status: 'active',
    }).exec();

    const counts = activeRotations.reduce((acc, rotation) => {
      const key = String(rotation.unit);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const result = units.map(unit => ({
      ...unit.toObject(),
      duration_days: unit.durationDays || unit.duration || null,
      duration: unit.duration || unit.durationDays || null,
      currentInterns: counts[String(unit._id)] || 0,
      workload: calculateWorkload(unit),
      isCritical: isCritical(unit),
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// PUT /api/units/reorder - Update unit order
router.put('/reorder', async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Payload must be an array of { id, position } objects' });
  }

  try {
    const updates = items.map(item => {
      if (!item || !item.id) return null;
      const nextOrder = Number.isInteger(item.order) ? item.order : (Number.isInteger(item.position) ? item.position : 0);
      return Unit.findByIdAndUpdate(item.id, { order: nextOrder }).exec();
    }).filter(Boolean);

    await Promise.all(updates);
    await logRecentUpdateSafe('units_reordered', 'Updated unit ordering');
    await updateBatchStats().catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering units:', err);
    res.status(500).json({ success: false, error: 'Failed to reorder units' });
  }
});

// GET /api/units/:id - Get specific unit
router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).exec();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    // Get current interns in this unit
    const today = new Date();
    const currentRotations = await Rotation.find({
      unit: unit._id,
      status: 'active',
    }).exec();

    const internIds = currentRotations.map(r => r.intern);
    const interns = await buildInternViews(internIds);

    res.json({
      ...unit.toObject(),
      duration_days: unit.durationDays || unit.duration || null,
      duration: unit.duration || unit.durationDays || null,
      interns,
      workload: calculateWorkload(unit),
      isCritical: isCritical(unit),
    });
  } catch (err) {
    console.error('Error fetching unit:', err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// POST /api/units - Create new unit
router.post('/', normalizeUnitPayload, validateUnitPayload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const unit = await createUnit(req.body);
    await logActivityEventSafe({
      type: ACTIVITY_TYPES.UNIT_CREATED,
      metadata: {
        unitId: unit._id.toString(),
        unitName: unit.name,
      },
    });
    await updateBatchStats().catch(() => {});
    res.status(201).json({ success: true, unit });
  } catch (err) {
    console.error('Error creating unit:', err);

    // Return validation errors for unique/required constraints
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    res.status(500).json({ error: 'Failed to create unit', details: err.message });
  }
});

// PUT /api/units/:id - Update unit
router.put('/:id', normalizeUnitPayload, validateUnitPayload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const previousUnit = await Unit.findById(req.params.id).exec();
    if (!previousUnit) return res.status(404).json({ error: 'Unit not found' });

    const unit = await updateUnit(req.params.id, req.body);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const trackedFields = ['name', 'durationDays', 'capacity', 'patientCount', 'description', 'order'];
    for (const field of trackedFields) {
      const oldValue = getComparableUnitValue(previousUnit, field);
      const newValue = getComparableUnitValue(unit, field);

      if (!areValuesEqual(oldValue, newValue)) {
        await logActivityEventSafe({
          type: ACTIVITY_TYPES.UNIT_UPDATED,
          metadata: {
            unitId: unit._id.toString(),
            unitName: unit.name,
            field,
            oldValue,
            newValue,
          },
        });
      }
    }

    const previousWorkload = previousUnit.workload || calculateWorkload(previousUnit);
    const nextWorkload = unit.workload || calculateWorkload(unit);
    if (previousWorkload !== nextWorkload) {
      await logActivityEventSafe({
        type: ACTIVITY_TYPES.WORKLOAD_UPDATED,
        metadata: {
          unitId: unit._id.toString(),
          unitName: unit.name,
          field: 'workload',
          oldValue: previousWorkload,
          newValue: nextWorkload,
        },
      });
    }

    await updateBatchStats().catch(() => {});
    res.json({ success: true, unit });
  } catch (err) {
    console.error('Error updating unit:', err);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// DELETE /api/units/:id - Delete unit and related rotations
router.delete('/:id', async (req, res) => {
  try {
    const unit = await deleteUnit(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    await Rotation.deleteMany({ unit: unit._id }).exec();
    await logActivityEventSafe({
      type: ACTIVITY_TYPES.UNIT_DELETED,
      metadata: {
        unitId: unit._id.toString(),
        unitName: unit.name,
      },
    });
    await updateBatchStats().catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ success: false, error: 'Failed to delete unit' });
  }
});

module.exports = router;
