const express = require('express');
const { body, validationResult } = require('express-validator');

const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');
const { createUnit, updateUnit, deleteUnit, calculateWorkload, isCritical } = require('../services/unitService');
const { ACTIVITY_TYPES, logActivityEventSafe, logRecentUpdateSafe } = require('../services/recentUpdatesService');
const { buildInternViews } = require('../services/internViewService');
const {
  getActiveUnitLoadMap,
  getReservedForwardSequenceKeys,
  rebuildInternFutureRotations,
} = require('../services/rotationPlanService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

const DEFAULT_ROTATION_DURATION_DAYS = 20;

const startOfDay = (dateLike = new Date()) => {
  const value = new Date(dateLike);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (dateLike, days) => {
  const value = new Date(dateLike);
  value.setDate(value.getDate() + Number(days || 0));
  return value;
};

const toIsoString = (dateLike) => {
  if (!dateLike) return null;
  const value = new Date(dateLike);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

const getUnitDuration = (unitDoc) => {
  const raw = unitDoc?.durationDays ?? unitDoc?.duration ?? unitDoc?.duration_days;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROTATION_DURATION_DAYS;
};

const recalculateEndDate = (startDate, duration) => {
  const start = startOfDay(startDate);
  return addDays(start, getUnitDuration({ durationDays: duration }) - 1);
};

const getRotationDateRange = (rotationDoc) => {
  const startDate = rotationDoc?.startDate ? startOfDay(rotationDoc.startDate) : null;
  if (!startDate) {
    return { startDate: null, endDate: null };
  }

  const duration = rotationDoc?.duration ?? rotationDoc?.unit?.durationDays ?? rotationDoc?.unit?.duration;
  const endDate = rotationDoc?.endDate
    ? startOfDay(rotationDoc.endDate)
    : recalculateEndDate(startDate, duration);

  return { startDate, endDate };
};

const getDerivedRotationStatus = (rotationDoc, today = startOfDay(new Date())) => {
  const { startDate, endDate } = getRotationDateRange(rotationDoc);

  if (!startDate) return 'upcoming';
  if (!endDate) {
    return startDate <= today ? 'active' : 'upcoming';
  }

  if (startDate <= today && endDate >= today) return 'active';
  if (startDate > today) return 'upcoming';
  return 'completed';
};

const formatUnitRotation = (rotationDoc, today = startOfDay(new Date())) => {
  const { startDate, endDate } = getRotationDateRange(rotationDoc);
  const unitId = rotationDoc?.unit?._id?.toString?.() || rotationDoc?.unit?.toString?.() || null;
  const unitName = rotationDoc?.unit?.name || null;
  const internId = rotationDoc?.intern?._id?.toString?.() || rotationDoc?.intern?.toString?.() || null;
  const internName = rotationDoc?.intern?.name || null;
  const internBatch = rotationDoc?.intern?.batch || null;
  const status = getDerivedRotationStatus(rotationDoc, today);

  return {
    id: rotationDoc?._id?.toString?.() || null,
    unitId,
    unit_id: unitId,
    unit_name: unitName,
    internId,
    intern_id: internId,
    intern_name: internName,
    intern_batch: internBatch,
    duration: getUnitDuration(rotationDoc),
    duration_days: getUnitDuration(rotationDoc),
    startDate: toIsoString(startDate),
    start_date: toIsoString(startDate),
    endDate: toIsoString(endDate),
    end_date: toIsoString(endDate),
    status,
    is_current: status === 'active',
  };
};

const buildCurrentInternRecord = (rotationRow) => ({
  id: rotationRow.intern_id,
  intern_id: rotationRow.intern_id,
  name: rotationRow.intern_name,
  intern_name: rotationRow.intern_name,
  batch: rotationRow.intern_batch,
  intern_batch: rotationRow.intern_batch,
  currentRotation: {
    unitId: rotationRow.unit_id,
    unit_id: rotationRow.unit_id,
    startDate: rotationRow.startDate,
    start_date: rotationRow.start_date,
    endDate: rotationRow.endDate,
    end_date: rotationRow.end_date,
  },
});

async function getUnitAssignments(unitIds) {
  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return new Map();
  }

  const today = startOfDay(new Date());
  const rotations = await Rotation.find({ unit: { $in: unitIds } })
    .populate('intern', 'name batch')
    .populate('unit', 'name durationDays duration')
    .sort({ startDate: -1, createdAt: -1 })
    .exec();

  const rotationsByUnit = new Map();
  for (const rotation of rotations) {
    const unitId = rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.() || null;
    if (!unitId) continue;

    const formattedRotation = formatUnitRotation(rotation, today);
    const unitRotations = rotationsByUnit.get(unitId) || [];
    unitRotations.push(formattedRotation);
    rotationsByUnit.set(unitId, unitRotations);
  }

  return rotationsByUnit;
}

const normalizeUnitPayload = (req, res, next) => {
  // Support both camelCase and snake_case payloads (frontend may send snake_case)
  if (req.body.unit_name !== undefined && req.body.name === undefined) {
    req.body.name = req.body.unit_name;
  }
  if (req.body.duration !== undefined && req.body.durationDays === undefined) {
    req.body.durationDays = req.body.duration;
  }
  if (req.body.duration_days !== undefined && req.body.durationDays === undefined) {
    req.body.durationDays = req.body.duration_days;
  }
  if (req.body.patient_count !== undefined && req.body.patientCount === undefined) {
    req.body.patientCount = req.body.patient_count;
  }
  next();
};

const validateUnitPayload = [
  body('name').customSanitizer((value) => typeof value === 'string' ? value.trim() : value)
    .notEmpty().withMessage('Unit name is required')
    .bail()
    .isLength({ max: 100 }).withMessage('Unit name must be 1-100 characters'),
  body('durationDays').customSanitizer((value) => Number(value))
    .isFloat({ min: 1, max: 365 }).withMessage('Valid duration is required'),
  body('workload').optional().isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High'),
  body('patientCount').optional().customSanitizer((value) => Number(value)).isInt({ min: 0 }).withMessage('Patient count must be a non-negative integer'),
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

    const unitIds = units.map((unit) => unit._id);
    const rotationsByUnit = await getUnitAssignments(unitIds);

    const result = units.map(unit => ({
      ...(() => {
        const unitObject = unit.toObject();
        const unitRotations = rotationsByUnit.get(String(unit._id)) || [];
        const currentRotations = unitRotations.filter((rotation) => rotation.is_current);
        const interns = currentRotations.map(buildCurrentInternRecord);
        const internNames = interns
          .map((intern) => intern.name ? `${intern.name}${intern.batch ? ` (${intern.batch})` : ''}` : null)
          .filter(Boolean);

        return {
          ...unitObject,
          duration_days: unit.durationDays || unit.duration || null,
          duration: unit.duration || unit.durationDays || null,
          currentInterns: interns.length,
          current_interns: interns.length,
          interns,
          intern_names: internNames,
          current_rotations: unitRotations,
        };
      })(),
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

    const internIds = await Rotation.distinct('intern').exec();
    const activeUnitLoadMap = await getActiveUnitLoadMap();
    for (const internId of internIds) {
      if (!internId) continue;
      const reservedSequenceKeys = await getReservedForwardSequenceKeys(String(internId));

      await rebuildInternFutureRotations({
        internId,
        reservedSequenceKeys,
        activeUnitLoadMap,
        now: new Date(),
      });
    }

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

    const rotationsByUnit = await getUnitAssignments([unit._id]);
    const unitRotations = rotationsByUnit.get(String(unit._id)) || [];
    const currentRotations = unitRotations.filter((rotation) => rotation.is_current);
    const interns = currentRotations.map(buildCurrentInternRecord);
    const internIds = interns.map((intern) => intern.id).filter(Boolean);
    const detailedInterns = internIds.length > 0 ? await buildInternViews(internIds) : [];

    res.json({
      ...unit.toObject(),
      duration_days: unit.durationDays || unit.duration || null,
      duration: unit.duration || unit.durationDays || null,
      currentInterns: interns.length,
      current_interns: interns.length,
      intern_names: interns
        .map((intern) => intern.name ? `${intern.name}${intern.batch ? ` (${intern.batch})` : ''}` : null)
        .filter(Boolean),
      interns: detailedInterns.length > 0 ? detailedInterns : interns,
      current_rotations: unitRotations,
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
    return res.status(400).json({ error: errors.array()[0]?.msg || 'Validation failed', errors: errors.array() });
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

    if (err.code === 11000) {
      return res.status(400).json({ error: 'A unit with this name already exists' });
    }

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
    return res.status(400).json({ error: errors.array()[0]?.msg || 'Validation failed', errors: errors.array() });
  }

  try {
    const previousUnit = await Unit.findById(req.params.id).exec();
    if (!previousUnit) return res.status(404).json({ error: 'Unit not found' });

    const unit = await updateUnit(req.params.id, req.body);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const durationChanged = !areValuesEqual(getComparableUnitValue(previousUnit, 'durationDays'), getComparableUnitValue(unit, 'durationDays'));

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

    if (durationChanged) {
      const affectedRotations = await Rotation.find({ unit: unit._id, status: { $in: ['active', 'upcoming'] } })
        .select('intern')
        .exec();
      const affectedInternIds = [...new Set(affectedRotations.map((rotation) => rotation.intern?.toString()).filter(Boolean))];
      const activeUnitLoadMap = await getActiveUnitLoadMap();
      for (const internId of affectedInternIds) {
        const reservedSequenceKeys = await getReservedForwardSequenceKeys(internId);

        await rebuildInternFutureRotations({
          internId,
          reservedSequenceKeys,
          activeUnitLoadMap,
          now: new Date(),
        });
      }
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
