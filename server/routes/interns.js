const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { createIntern, ensureInternStatusIsCorrect } = require('../services/internService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');
const { buildInternView, buildInternViews } = require('../services/internViewService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

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
  body('gender').optional().isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('batch').optional().isIn(['A', 'B']).withMessage('Batch must be A or B'),
  body('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  body('email').optional().isEmail().withMessage('Email must be valid'),
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
    const interns = await Intern.find(filter).populate('currentUnit').sort({ createdAt: sortDirection }).exec();

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
      return buildInternView(intern._id);
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
    const internView = await buildInternView(req.params.id);
    const current = internView.rotations.find(r => r.status === 'active') || null;
    const upcoming = internView.rotations.filter(r => r.status === 'upcoming');
    const completed = internView.rotations.filter(r => r.status === 'completed');

    res.json({ rotations: internView.rotations, current, upcoming, completed });
  } catch (err) {
    console.error('Error fetching intern schedule:', err);
    res.status(500).json({ error: 'Failed to fetch intern schedule' });
  }
});

// GET /api/interns/:id - Get a single intern
router.get('/:id', async (req, res) => {
  try {
    const internView = await buildInternView(req.params.id);
    res.json(internView);
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

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.status(201).json({ success: true, intern: internView });
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

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, intern: internView });
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

    await updateBatchStats().catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting intern:', err);
    res.status(500).json({ success: false, error: 'Failed to delete intern' });
  }
});

// Legacy manual assignment endpoint disabled. Manual assignment is removed per new requirements.
router.post('/:id/manual-assign', async (req, res) => {
  return res.status(410).json({ error: 'Manual assignment endpoint removed' });
});

// POST /api/interns/:id/reassign - Reassign intern to a different unit
router.post('/:id/reassign', async (req, res) => {
  try {
    const { unitId, startDate } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId is required' });
    if (!mongoose.Types.ObjectId.isValid(unitId)) return res.status(400).json({ error: 'Invalid unitId format' });

    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    const unit = await Unit.findById(unitId).exec();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    // Find current active rotation
    const today = new Date();
    const currentRotation = await Rotation.findOne({
      internId: intern._id,
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).exec();

    if (!currentRotation) {
      return res.status(400).json({ error: 'No active rotation found for this intern' });
    }

    // Update the current rotation to end today
    currentRotation.endDate = today;
    await currentRotation.save();

    // Create new rotation starting from specified date or tomorrow
    const newStartDate = startDate ? new Date(startDate) : new Date(today);
    newStartDate.setDate(newStartDate.getDate() + 1); // Start tomorrow if no date specified

    const duration = unit.durationDays || unit.duration || 0;

    const newEndDate = new Date(newStartDate);
    newEndDate.setDate(newEndDate.getDate() + duration - 1);

    const newRotation = new Rotation({
      internId: intern._id,
      unitId: unit._id,
      startDate: newStartDate,
      endDate: newEndDate,
      isManualAssignment: true
    });

    await newRotation.save();
    intern.currentUnit = unit._id;
    await intern.save();

    await logRecentUpdateSafe('intern_reassigned', `Reassigned ${intern.name} to ${unit.name}`);

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, intern: internView });
  } catch (err) {
    console.error('Error reassigning intern:', err);
    res.status(500).json({ success: false, error: 'Failed to reassign intern' });
  }
});

// POST /api/interns/:id/extend - Extend intern's current rotation
router.post('/:id/extend', async (req, res) => {
  try {
    const days = Number(req.body.days);
    if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: 'Valid number of days is required' });

    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    // Find current active rotation
    const today = new Date();
    const currentRotation = await Rotation.findOne({
      internId: intern._id,
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).exec();

    if (!currentRotation) {
      return res.status(400).json({ error: 'No active rotation found for this intern' });
    }

    // Extend the rotation
    currentRotation.endDate = new Date(currentRotation.endDate);
    currentRotation.endDate.setDate(currentRotation.endDate.getDate() + days);
    await currentRotation.save();

    // Update intern's extension days
    intern.extensionDays = (intern.extensionDays || 0) + days;
    await intern.save();

    await logRecentUpdateSafe('intern_extended', `Extended ${intern.name}'s rotation by ${days} days`);

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, intern: internView });
  } catch (err) {
    console.error('Error extending intern rotation:', err);
    res.status(500).json({ success: false, error: 'Failed to extend intern rotation' });
  }
});

module.exports = router;
