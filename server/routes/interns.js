const express = require('express');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { createIntern, ensureInternStatusIsCorrect } = require('../services/internService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');

const router = express.Router();

const normalizeInternPayload = (req, res, next) => {
  // Support both camelCase and snake_case payloads (frontend may send snake_case)
  if (req.body.start_date !== undefined && req.body.startDate === undefined) {
    req.body.startDate = req.body.start_date;
  }
  if (req.body.phone_number !== undefined && req.body.phoneNumber === undefined) {
    req.body.phoneNumber = req.body.phone_number;
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

    // Optionally enrich with current rotation
    const today = new Date();
    const enriched = await Promise.all(interns.map(async (intern) => {
      await ensureInternStatusIsCorrect(intern._id);
      const currentRotation = await Rotation.findOne({
        internId: intern._id,
        startDate: { $lte: today },
        endDate: { $gte: today },
      }).populate('unitId').exec();

      return {
        ...intern.toObject(),
        currentUnit: currentRotation?.unitId || null,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching interns:', err);
    res.status(500).json({ error: 'Failed to fetch interns' });
  }
});

// GET /api/interns/:id - Get a single intern
router.get('/:id', async (req, res) => {
  try {
    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    const rotations = await Rotation.find({ internId: intern._id })
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    res.json({ ...intern.toObject(), rotations });
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
    const intern = await createIntern(req.body, { autoGenerateRotations: false });
    await logRecentUpdateSafe('new_intern', `Created intern: ${intern.name}`);
    res.status(201).json(intern);
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

    res.json(intern);
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
