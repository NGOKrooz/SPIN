const express = require('express');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { createIntern, ensureInternStatusIsCorrect } = require('../services/internService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');

const router = express.Router();

// Helpers
const toIsoString = (date) => {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch (_) {
    return null;
  }
};

const getRotationStatus = (rotation, today = new Date()) => {
  const start = rotation.startDate ? new Date(rotation.startDate) : new Date(rotation.start_date);
  const end = rotation.endDate ? new Date(rotation.endDate) : new Date(rotation.end_date);
  if (!start || !end) return 'upcoming';

  if (start <= today && end >= today) return 'active';
  if (start > today) return 'upcoming';
  return 'completed';
};

const formatRotation = (rotation) => {
  const status = getRotationStatus(rotation);

  const unit = rotation.unitId || rotation.unit || rotation.unit_id || null;
  const unitId = unit?._id?.toString() || unit?.id || null;
  const unitName = unit?.name || (rotation.unit_name || null);

  return {
    id: rotation._id?.toString(),
    startDate: toIsoString(rotation.startDate || rotation.start_date),
    endDate: toIsoString(rotation.endDate || rotation.end_date),
    start_date: toIsoString(rotation.startDate || rotation.start_date),
    end_date: toIsoString(rotation.endDate || rotation.end_date),
    status,
    unitId,
    unit_id: unitId,
    unitName,
    unit_name: unitName,
    isManualAssignment: Boolean(rotation.isManualAssignment || rotation.is_manual_assignment),
    is_manual_assignment: Boolean(rotation.isManualAssignment || rotation.is_manual_assignment),
    unit: unit ? {
      id: unitId,
      name: unitName,
      durationDays: unit.durationDays || unit.duration_days || null,
      position: unit.position || unit.order || null,
    } : null,
  };
};

const formatIntern = (intern, rotations = []) => {
  const today = new Date();
  const formattedRotations = (rotations || []).map(formatRotation);

  const currentRotation = formattedRotations.find(r => r.status === 'active');
  const upcomingRotations = formattedRotations.filter(r => r.status === 'upcoming');
  const completedRotations = formattedRotations.filter(r => r.status === 'completed');

  const startDate = intern.startDate || intern.start_date;

  return {
    id: intern._id?.toString(),
    name: intern.name || '',
      startDate: toIsoString(startDate),
    start_date: toIsoString(startDate),
    gender: intern.gender || null,
    batch: intern.batch || null,
    status: intern.status || null,
    extensionDays: intern.extensionDays || intern.extension_days || 0,
    extension_days: intern.extensionDays || intern.extension_days || 0,
    phoneNumber: intern.phoneNumber || intern.phone_number || '',
    phone_number: intern.phoneNumber || intern.phone_number || '',
    currentUnit: currentRotation?.unit || null,
    rotations: formattedRotations,
    upcomingUnits: upcomingRotations,
    completedUnits: completedRotations,
    createdAt: toIsoString(intern.createdAt),
    updatedAt: toIsoString(intern.updatedAt),
  };
};

const normalizeInternPayload = (req, res, next) => {
  // Support both camelCase and snake_case payloads (frontend may send snake_case)
  if (req.body.start_date !== undefined && req.body.startDate === undefined) {
    req.body.startDate = req.body.start_date;
  }
  if (req.body.phone_number !== undefined && req.body.phoneNumber === undefined) {
    req.body.phoneNumber = req.body.phone_number;
  }
  if (req.body.extension_days !== undefined && req.body.extensionDays === undefined) {
    req.body.extensionDays = req.body.extension_days;
  }

  next();
};

const validateIntern = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('gender').isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('batch').optional().isIn(['A', 'B']).withMessage('Batch must be A or B'),
  body('startDate').isISO8601().withMessage('Start date must be a valid date'),
  body('phoneNumber').optional().isString().withMessage('Phone number must be a string'),
];

// GET /api/interns - List interns
router.get('/', async (req, res) => {
  try {
    const { batch, status, sort } = req.query;
    const filter = {};
    if (batch) filter.batch = batch;
    if (status) filter.status = status;

    const sortDirection = String(sort || 'newest').toLowerCase() === 'oldest' ? 1 : -1;
    const interns = await Intern.find(filter).sort({ createdAt: sortDirection }).exec();

    const internIds = interns.map(i => i._id);
    const rotations = await Rotation.find({ internId: { $in: internIds } })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    const rotationsByIntern = rotations.reduce((acc, rotation) => {
      const key = rotation.internId?.toString();
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(rotation);
      return acc;
    }, {});

    const enriched = await Promise.all(interns.map(async (intern) => {
      await ensureInternStatusIsCorrect(intern._id);
      return formatIntern(intern, rotationsByIntern[intern._id.toString()] || []);
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching interns:', err);
    res.status(500).json({ error: 'Failed to fetch interns' });
  }
});

// GET /api/interns/:id/schedule - Get intern schedule (rotations)
router.get('/:id/schedule', async (req, res) => {
  try {
    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    const rotations = await Rotation.find({ internId: intern._id })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    const formatted = rotations.map(formatRotation);
    const current = formatted.find(r => r.status === 'active') || null;
    const upcoming = formatted.filter(r => r.status === 'upcoming');
    const completed = formatted.filter(r => r.status === 'completed');

    res.json({ rotations: formatted, current, upcoming, completed });
  } catch (err) {
    console.error('Error fetching intern schedule:', err);
    res.status(500).json({ error: 'Failed to fetch intern schedule' });
  }
});

// GET /api/interns/:id - Get a single intern
router.get('/:id', async (req, res) => {
  try {
    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    await ensureInternStatusIsCorrect(intern._id);

    const rotations = await Rotation.find({ internId: intern._id })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    res.json(formatIntern(intern, rotations));
  } catch (err) {
    console.error('Error fetching intern:', err);
    res.status(500).json({ error: 'Failed to fetch intern' });
  }
});

// POST /api/interns - Create a new intern
router.post('/', normalizeInternPayload, validateIntern, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const intern = await createIntern(req.body, { autoGenerateRotations: true });
    await logRecentUpdateSafe('new_intern', `Created intern: ${intern.name}`);

    const rotations = await Rotation.find({ internId: intern._id })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    res.status(201).json(formatIntern(intern, rotations));
  } catch (err) {
    console.error('Error creating intern:', err);

    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    res.status(500).json({ error: 'Failed to create intern', details: err.message });
  }
});

// PUT /api/interns/:id - Update existing intern
router.put('/:id', normalizeInternPayload, validateIntern, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    const updates = ['name', 'gender', 'batch', 'startDate', 'phoneNumber', 'status', 'extensionDays'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) {
        intern[field] = req.body[field];
      }
    });

    await intern.save();
    await ensureInternStatusIsCorrect(intern._id);

    const rotations = await Rotation.find({ internId: intern._id })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    res.json(formatIntern(intern, rotations));
  } catch (err) {
    console.error('Error updating intern:', err);
    res.status(500).json({ error: 'Failed to update intern' });
  }
});

// DELETE /api/interns/:id - Delete intern and related rotations
router.delete('/:id', async (req, res) => {
  try {
    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    await Rotation.deleteMany({ internId: intern._id }).exec();
    await intern.deleteOne();
    await logRecentUpdateSafe('intern_deleted', `Deleted intern: ${intern.name}`);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting intern:', err);
    res.status(500).json({ error: 'Failed to delete intern' });
  }
});

module.exports = router;
