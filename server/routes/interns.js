const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { ensureInternStatusIsCorrect } = require('../services/internService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');
const { createExtensionReason } = require('../services/extensionService');
const { createWorkloadHistory } = require('../services/workloadService');
const { buildInternView, buildInternViews } = require('../services/internViewService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

const getOrderedUnits = async () => {
  return Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
};

const mapInternWithUnits = (internDoc, units) => {
  const intern = internDoc.toObject();
  const currentUnitId = intern.currentUnit?._id?.toString() || null;
  const currentIndex = currentUnitId
    ? units.findIndex((unit) => unit._id.toString() === currentUnitId)
    : -1;
  const upcomingUnitDoc = currentIndex >= 0 ? (units[currentIndex + 1] || null) : null;

  console.log('CURRENT UNIT:', intern.currentUnit);
  console.log('UPCOMING UNIT:', upcomingUnitDoc);

  return {
    ...intern,
    currentUnit: intern.currentUnit || null,
    upcomingUnit: upcomingUnitDoc ? {
      _id: upcomingUnitDoc._id,
      name: upcomingUnitDoc.name,
      order: upcomingUnitDoc.order ?? upcomingUnitDoc.position ?? null,
    } : null,
  };
};

const normalizeInternPayload = (req, res, next) => {
  // Support both camelCase and snake_case payloads (frontend may send snake_case)
  if (req.body.start_date !== undefined && req.body.startDate === undefined) {
    req.body.startDate = req.body.start_date;
  }
  if (req.body.phone_number !== undefined && req.body.phone === undefined) {
    req.body.phone = req.body.phone_number;
  }
  if (req.body.phoneNumber !== undefined && req.body.phone === undefined) {
    req.body.phone = req.body.phoneNumber;
  }
  if (req.body.extension_days !== undefined && req.body.extensionDays === undefined) {
    req.body.extensionDays = req.body.extension_days;
  }

  next();
};

const validateIntern = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('gender').isIn(['Male', 'Female']).withMessage('Gender is required and must be Male or Female'),
  body('batch').isIn(['A', 'B']).withMessage('Batch is required and must be A or B'),
  body('startDate').isISO8601().withMessage('Start date is required and must be a valid date'),
];

// GET /api/interns - List interns
router.get('/', async (req, res) => {
  try {
    const units = await getOrderedUnits();

    const interns = await Intern.find()
      .select('-email -phoneNumber')
      .populate('currentUnit')
      .populate({
        path: 'rotationHistory',
        populate: { path: 'unit' }
      })
      .sort({ createdAt: -1 })
      .exec();

    const withUnitProgress = interns.map((internDoc) => mapInternWithUnits(internDoc, units));

    console.log('FETCHED INTERNS:', withUnitProgress);
    return res.json(withUnitProgress);
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
    const { name, gender, startDate, phone = '', batch } = req.body;
    console.log('POST BODY:', req.body);

    const intern = await Intern.create({
      name,
      gender,
      startDate,
      phone,
      batch,
    });

    const units = await getOrderedUnits();
    if (units.length > 0) {
      intern.currentUnit = units[0]._id;
      await intern.save();
      console.log('ASSIGNED FIRST UNIT:', units[0].name);
    }

    console.log('CREATED INTERN:', intern);

    const check = await Intern.findById(intern._id)
      .select('-email -phoneNumber')
      .populate('currentUnit')
      .exec();
    console.log('VERIFIED INTERN:', check);

    await logRecentUpdateSafe('Intern Created', null, intern._id);
    await updateBatchStats().catch(() => {});

    return res.status(201).json(mapInternWithUnits(check, units));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
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

    const updates = ['name', 'gender', 'batch', 'startDate', 'phone', 'status', 'extensionDays'];
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
    const { unitId } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId is required' });
    if (!mongoose.Types.ObjectId.isValid(unitId)) return res.status(400).json({ error: 'Invalid unitId format' });

    const intern = await Intern.findById(req.params.id).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    const unit = await Unit.findById(unitId).exec();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    await Rotation.updateMany(
      { intern: intern._id, status: 'active' },
      { $set: { status: 'completed', endDate: new Date() } }
    ).exec();

    const newRotation = await Rotation.create({
      intern: intern._id,
      unit: unit._id,
      startDate: new Date(),
      status: 'active',
    });

    intern.currentUnit = unit._id;

    const existsInHistory = (intern.rotationHistory || []).some(
      (rotationId) => rotationId.toString() === newRotation._id.toString()
    );
    if (!existsInHistory) {
      intern.rotationHistory.push(newRotation._id);
    }

    await intern.save();
    console.log('UPDATED CURRENT UNIT:', intern.currentUnit);

    console.log(`Successfully reassigned ${intern.name} to ${unit.name}`);

    try {
      const recordedWorkload = await createWorkloadHistory(intern._id, unit._id, 0);
      console.log('Workload history on reassign:', recordedWorkload);
    } catch (workloadError) {
      console.warn('Failed to write workload history during reassignment:', workloadError.message);
    }

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
