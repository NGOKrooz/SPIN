const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { createIntern, ensureInternStatusIsCorrect } = require('../services/internService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');
const { createWorkloadHistory } = require('../services/workloadService');
const { createExtensionReason } = require('../services/extensionService');
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
  body('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
];

// GET /api/interns - List interns
router.get('/', async (req, res) => {
  try {
    const interns = await Intern.find().populate('currentUnit').sort({ createdAt: -1 }).exec();
    console.log("🔵 GET /api/interns - FETCHED INTERNS:", interns.length, "interns");
    console.log("   IDs:", interns.map(i => i._id.toString()).join(", ") || "none");

    const internIds = interns.map(i => i._id);
    const rotations = await Rotation.find({ intern: { $in: internIds } })
      .populate('unit')
      .sort({ startDate: 1 })
      .exec();

    const rotationsByIntern = rotations.reduce((acc, rotation) => {
      const key = rotation.intern?.toString();
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(rotation);
      return acc;
    }, {});

    const enriched = await Promise.all(interns.map(async (intern) => {
      await ensureInternStatusIsCorrect(intern._id);
      return buildInternView(intern._id);
    }));

    console.log("📤 GET /api/interns - RETURNING:", enriched.length, "formatted interns");
    res.json(enriched);
  } catch (err) {
    console.error('❌ Error fetching interns:', err);
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
    console.log("🔵 POST /api/interns - POST BODY:", JSON.stringify(req.body, null, 2));

    const intern = await createIntern(req.body);
    console.log("✅ CREATED INTERN IN SERVICE:", JSON.stringify(intern, null, 2));

    // Immediate verification
    const verified = await Intern.findById(intern._id).exec();
    console.log("🔍 VERIFIED INTERN IN DB:", verified ? "✅ FOUND" : "❌ NOT FOUND");
    if (verified) {
      console.log("   Details:", JSON.stringify(verified, null, 2));
    }

    await logRecentUpdateSafe('Intern Created', null, intern._id);

    const defaultUnit = await Unit.findOne().sort({ order: 1 }).exec();
    if (defaultUnit) {
      const workloadLog = await createWorkloadHistory(intern._id, defaultUnit._id, 0);
      console.log('✅ Created initial workload history:', workloadLog);
    }

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    console.log("📤 RETURNING INTERN VIEW:", JSON.stringify(internView, null, 2));
    
    // Return the internView directly (consistent with GET /api/interns format)
    res.status(201).json(internView);
  } catch (err) {
    console.error('❌ Error creating intern:', err);

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

    await Rotation.deleteMany({ intern: intern._id }).exec();
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
    console.log(`Reassigning intern ${req.params.id} to unit ${req.body.unitId}`);
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
      $or: [
        { intern: intern._id },
        { internId: intern._id }
      ],
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).exec();

    if (!currentRotation) {
      return res.status(400).json({ error: 'No active rotation found for this intern' });
    }

    // Update the current rotation to end today
    currentRotation.endDate = today;
    currentRotation.status = 'completed';
    await currentRotation.save();

    // Create new rotation starting from specified date or tomorrow
    const newStartDate = startDate ? new Date(startDate) : new Date(today);
    newStartDate.setDate(newStartDate.getDate() + 1); // Start tomorrow if no date specified

    const newEndDate = new Date(newStartDate);
    newEndDate.setDate(newEndDate.getDate() + 6); // 7 days default

    const newRotation = new Rotation({
      intern: intern._id,
      unit: unit._id,
      startDate: newStartDate,
      endDate: newEndDate,
      status: 'active'
    });

    await newRotation.save();
    intern.currentUnit = unit._id;
    intern.rotationHistory.push(newRotation._id);
    await intern.save();

    console.log(`Successfully reassigned ${intern.name} to ${unit.name}`);

    const recordedWorkload = await createWorkloadHistory(intern._id, unit._id, 0);
    console.log('Workload history on reassign:', recordedWorkload);

    await logRecentUpdateSafe('Unit Reassigned', null, intern._id);

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
    console.log(`Extending intern ${req.params.id} by ${req.body.days} days`);
    const days = Number(req.body.days);
    if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: 'Valid number of days is required' });

    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    // Find current active rotation
    const today = new Date();
    const currentRotation = await Rotation.findOne({
      $or: [
        { intern: intern._id },
        { internId: intern._id }
      ],
      startDate: { $lte: today },
      endDate: { $gte: today }
    }).exec();

    if (!currentRotation) {
      return res.status(400).json({ error: 'No active rotation found for this intern' });
    }

    // Extend the rotation
    const newEndDate = new Date(currentRotation.endDate);
    newEndDate.setDate(newEndDate.getDate() + days);
    
    await Rotation.updateOne(
      { _id: currentRotation._id },
      { 
        $set: { 
          endDate: newEndDate,
          intern: currentRotation.intern || currentRotation.internId,
          unit: currentRotation.unit || currentRotation.unitId
        } 
      }
    );

    // Update intern's extension days
    intern.extensionDays = (intern.extensionDays || 0) + days;
    await intern.save();

    const reasonText = req.body.reason || 'No reason provided';
    const extensionLog = await createExtensionReason(intern._id, days, reasonText);
    console.log('Created extension reason:', extensionLog);

    console.log(`Successfully extended ${intern.name}'s rotation by ${days} days`);
    await logRecentUpdateSafe('Extension Added', reasonText, intern._id);

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, intern: internView });
  } catch (err) {
    console.error('Error extending intern rotation:', err);
    res.status(500).json({ success: false, error: 'Failed to extend intern rotation' });
  }
});

module.exports = router;
