const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const { ensureInternStatusIsCorrect } = require('../services/internService');
const { ACTIVITY_TYPES, logActivityEventSafe } = require('../services/recentUpdatesService');
const { createExtensionReason } = require('../services/extensionService');
const { createWorkloadHistory } = require('../services/workloadService');
const { buildInternView, buildInternViews } = require('../services/internViewService');
const {
  getUnitDuration,
  recalculateEndDate,
  getOrderedUnits,
  getActiveUnitLoadMap,
  getReservedForwardSequenceKeys,
  buildInitialRotationPlanForIntern,
  rebuildInternFutureRotations,
} = require('../services/rotationPlanService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

const DEFAULT_ROTATION_DURATION_DAYS = 20;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

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

const getInternSortDirection = (sortValue) => {
  const normalized = String(sortValue || 'newest').trim().toLowerCase();
  return normalized === 'oldest' || normalized === 'asc' ? 1 : -1;
};

const toValidDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatRotationForSchedule = (rotation) => {
  const unitName = rotation?.unit?.name || 'Unknown Unit';
  const unitId = rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.() || null;

  return {
    id: rotation._id.toString(),
    unit: rotation.unit || null,
    unit_name: unitName,
    unit_id: unitId,
    startDate: rotation.startDate,
    endDate: rotation.endDate,
    start_date: rotation.startDate ? new Date(rotation.startDate).toISOString() : null,
    end_date: rotation.endDate ? new Date(rotation.endDate).toISOString() : null,
    duration: rotation.duration,
    duration_days: rotation.duration,
    status: rotation.status,
  };
};

const syncInternRotationStates = async (internId) => {
  const now = startOfDay(new Date());
  const rotations = await Rotation.find({ intern: internId }).sort({ startDate: 1 }).exec();

  let hasActive = false;
  for (const rotation of rotations) {
    const duration = Number(rotation.duration);
    const safeDuration = Number.isFinite(duration) && duration > 0
      ? duration
      : DEFAULT_ROTATION_DURATION_DAYS;

    if (rotation.duration !== safeDuration) {
      rotation.duration = safeDuration;
    }

    if (!rotation.endDate || Number.isNaN(new Date(rotation.endDate).getTime())) {
      rotation.endDate = recalculateEndDate(rotation.startDate, safeDuration);
    }

    const startDate = startOfDay(rotation.startDate);
    const endDate = startOfDay(rotation.endDate);

    let nextStatus = rotation.status;
    if (rotation.status !== 'completed' && now > endDate) {
      nextStatus = 'completed';
    } else if (
      rotation.status !== 'completed' &&
      !hasActive &&
      startDate <= now &&
      now <= endDate
    ) {
      nextStatus = 'active';
      hasActive = true;
    } else if (rotation.status !== 'completed') {
      nextStatus = 'upcoming';
    }

    if (rotation.status !== nextStatus) {
      rotation.status = nextStatus;
    }

    await rotation.save();
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error('Intern not found');
  }

  const current = rotations.find((rotation) => rotation.status === 'active') || null;
  const upcoming = rotations.filter((rotation) => rotation.status === 'upcoming');
  const completed = rotations.filter((rotation) => rotation.status === 'completed');

  intern.currentUnit = current?.unit || null;
  if (rotations.length > 0 && completed.length === rotations.length) {
    intern.status = 'completed';
  } else if (Number(intern.extensionDays || 0) > 0) {
    intern.status = 'extended';
  } else {
    intern.status = 'active';
  }
  await intern.save();

  return {
    current,
    upcoming,
    completed,
  };
};

const mapInternWithUnits = (internDoc, units) => {
  const intern = internDoc.toObject();
  const rotations = Array.isArray(intern.rotationHistory)
    ? [...intern.rotationHistory].sort((left, right) => {
      const leftDate = toValidDate(left?.startDate || left?.start_date || left?.createdAt);
      const rightDate = toValidDate(right?.startDate || right?.start_date || right?.createdAt);
      return (leftDate?.getTime() || 0) - (rightDate?.getTime() || 0);
    })
    : [];
  const activeRotation = rotations.find((rotation) => rotation?.status === 'active') || null;
  const upcomingRotations = rotations.filter((rotation) => rotation?.status === 'upcoming');
  const currentUnitId = (
    intern.currentUnit?._id?.toString()
    || activeRotation?.unit?._id?.toString?.()
    || activeRotation?.unit?.toString?.()
    || null
  );

  const completedUnitIds = new Set(
    rotations
      .filter((rotation) => rotation?.status === 'completed')
      .map((rotation) => (
        rotation?.unit?._id?.toString?.()
        || rotation?.unit?.toString?.()
        || null
      ))
      .filter(Boolean)
  );

  const unitById = new Map(units.map((unit) => [unit._id.toString(), unit]));
  const remainingUnitDocs = [];
  const seenUpcoming = new Set();

  for (const rotation of upcomingRotations) {
    const unitId = rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.() || null;
    if (!unitId || seenUpcoming.has(unitId)) continue;
    const unitDoc = unitById.get(unitId);
    if (!unitDoc) continue;
    remainingUnitDocs.push(unitDoc);
    seenUpcoming.add(unitId);
  }

  for (const unit of units) {
    const unitId = unit._id.toString();
    if (seenUpcoming.has(unitId)) continue;
    if (currentUnitId && unitId === currentUnitId) continue;
    if (completedUnitIds.has(unitId)) continue;
    remainingUnitDocs.push(unit);
  }

  const upcomingUnitDoc = remainingUnitDocs[0] || null;
  const derivedStatus = intern.status || 'active';

  const internshipStart = toValidDate(intern.startDate || intern.start_date);
  const today = new Date();
  const internshipDays = internshipStart
    ? Math.max(0, Math.floor((today - internshipStart) / DAY_IN_MS))
    : 0;

  return {
    ...intern,
    batch: intern.batch || null,
    status: derivedStatus,
    currentUnit: intern.currentUnit || null,
    upcomingUnit: upcomingUnitDoc ? {
      _id: upcomingUnitDoc._id,
      name: upcomingUnitDoc.name,
      order: upcomingUnitDoc.order ?? upcomingUnitDoc.position ?? null,
    } : null,
    remainingUnits: remainingUnitDocs.map((unit) => ({
      _id: unit._id,
      name: unit.name,
      order: unit.order ?? unit.position ?? null,
    })),
    internshipDays,
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
    const sortDirection = getInternSortDirection(req.query.sort);
    const units = await getOrderedUnits();

    const interns = await Intern.find()
      .select('-email -phoneNumber')
      .populate('currentUnit')
      .populate({
        path: 'rotationHistory',
        populate: { path: 'unit' }
      })
      .sort({ startDate: sortDirection, createdAt: sortDirection })
      .exec();

    const withUnitProgress = interns
      .map((internDoc) => mapInternWithUnits(internDoc, units))
      .sort((left, right) => {
        const leftDate = toValidDate(left.startDate || left.createdAt);
        const rightDate = toValidDate(right.startDate || right.createdAt);
        const leftTime = leftDate ? leftDate.getTime() : 0;
        const rightTime = rightDate ? rightDate.getTime() : 0;
        return sortDirection === 1 ? leftTime - rightTime : rightTime - leftTime;
      });

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
    await syncInternRotationStates(req.params.id);

    const internDoc = await Intern.findById(req.params.id).populate('currentUnit').exec();
    if (!internDoc) return res.status(404).json({ error: 'Intern not found' });

    const rawRotations = await Rotation.find({ intern: internDoc._id })
      .populate('unit')
      .sort({ startDate: 1 })
      .exec();

    const currentRotation = rawRotations.find((rotation) => rotation.status === 'active') || null;
    const upcomingRotations = rawRotations.filter((rotation) => rotation.status === 'upcoming');
    const completedRotations = rawRotations.filter((rotation) => rotation.status === 'completed');

    let progress = 'Not started';
    if (currentRotation) {
      const now = new Date();
      const currentStart = new Date(currentRotation.startDate);
      const daysSpent = Math.max(0, Math.floor((now - currentStart) / (1000 * 60 * 60 * 24)));
      progress = `${daysSpent}/${currentRotation.duration || DEFAULT_ROTATION_DURATION_DAYS}`;
    }

    const current = currentRotation ? formatRotationForSchedule(currentRotation) : null;
    const upcoming = upcomingRotations.map(formatRotationForSchedule);
    const completed = completedRotations.map(formatRotationForSchedule);

    console.log('UPCOMING:', upcoming);

    const internView = await buildInternView(req.params.id);

    res.json({
      rotations: internView.rotations,
      current,
      upcoming,
      completed,
      currentUnit: current?.unit_name || 'Not started',
      currentStart: currentRotation?.startDate || null,
      currentEnd: currentRotation?.endDate || null,
      progress,
      upcomingRotations: upcoming,
      remaining: upcoming,
      remainingCount: upcoming.length,
      totalExtensionDays: Number(internDoc.totalExtensionDays || 0),
    });
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

    const parsedStartDate = toValidDate(startDate);
    if (!parsedStartDate) {
      return res.status(400).json({ error: 'Invalid start date' });
    }

    const intern = await Intern.create({
      name,
      gender,
      startDate: parsedStartDate,
      phone,
      batch,
      status: 'active',
      extensionDays: 0,
      totalExtensionDays: 0,
    });

    const units = await getOrderedUnits();
    if (units.length > 0) {
      const [reservedSequenceKeys, activeUnitLoadMap] = await Promise.all([
        getReservedForwardSequenceKeys(intern._id),
        getActiveUnitLoadMap(),
      ]);
      const plan = await buildInitialRotationPlanForIntern({
        intern,
        units,
        reservedSequenceKeys,
        activeUnitLoadMap,
        now: new Date(),
      });

      intern.rotationHistory = plan.map((rotation) => rotation._id);
      await intern.save();
      await syncInternRotationStates(intern._id);
      console.log('ASSIGNED FULL ROTATION PLAN:', plan.map((rotation) => ({
        id: rotation._id.toString(),
        status: rotation.status,
      })));
    }

    console.log('CREATED INTERN:', intern);

    const check = await Intern.findById(intern._id)
      .select('-email -phoneNumber')
      .populate('currentUnit')
      .exec();
    console.log('VERIFIED INTERN:', check);

    await logActivityEventSafe({
      type: ACTIVITY_TYPES.INTERN_CREATED,
      metadata: {
        internId: intern._id.toString(),
        internName: intern.name,
      },
    });
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

    if (req.body.startDate !== undefined) {
      const parsedStartDate = toValidDate(req.body.startDate);
      if (!parsedStartDate) {
        return res.status(400).json({ error: 'Invalid start date' });
      }
      req.body.startDate = parsedStartDate;
    }

    const updates = ['name', 'gender', 'batch', 'startDate', 'phone', 'status', 'extensionDays', 'totalExtensionDays'];
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

    await logActivityEventSafe({
      type: ACTIVITY_TYPES.INTERN_DELETED,
      metadata: {
        internId: intern._id.toString(),
        internName: intern.name,
      },
    });

    await Rotation.deleteMany({ intern: intern._id }).exec();
    await intern.deleteOne();

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

    const selectedUnit = await Unit.findById(unitId).exec();
    if (!selectedUnit) return res.status(400).json({ error: 'Invalid unit selected' });

    await syncInternRotationStates(intern._id);

    const current = await Rotation.findOne({
      intern: intern._id,
      status: 'active',
    })
      .populate('unit', 'name')
      .exec();

    if (!current) {
      return res.status(400).json({ error: 'No active rotation found for this intern' });
    }

    const upcomingRotations = await Rotation.find({
      intern: intern._id,
      status: 'upcoming',
    })
      .sort({ startDate: 1 })
      .populate('unit', 'name durationDays duration order position')
      .exec();

    const upcomingUnitIds = upcomingRotations
      .map((rotation) => rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.() || null)
      .filter(Boolean);
    const selectedIndex = upcomingUnitIds.findIndex((value) => String(value) === String(unitId));
    if (selectedIndex < 0) {
      return res.status(400).json({
        error: 'Selected unit must be one of the upcoming units only',
      });
    }

    const previousUnitId = current.unit?._id?.toString?.() || current.unit?.toString?.() || intern.currentUnit?.toString?.() || null;
    const previousUnitName = current.unit?.name || 'Unknown unit';

    const currentStart = current.startDate ? startOfDay(current.startDate) : startOfDay(new Date());
    const today = startOfDay(new Date());
    const daysInCurrentUnit = Math.max(0, Math.floor((today.getTime() - currentStart.getTime()) / DAY_IN_MS));

    current.unit = selectedUnit._id;
    current.duration = getUnitDuration(selectedUnit);
    current.startDate = today;
    current.endDate = recalculateEndDate(current.startDate, current.duration);
    await current.save();

    const [reservedSequenceKeys, activeUnitLoadMap] = await Promise.all([
      getReservedForwardSequenceKeys(intern._id),
      getActiveUnitLoadMap(),
    ]);
    await rebuildInternFutureRotations({
      internId: intern._id,
      reservedSequenceKeys,
      activeUnitLoadMap,
      now: new Date(),
    });

    intern.currentUnit = selectedUnit._id;
    if (!intern.status || intern.status === 'completed') {
      intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
    }

    await intern.save();
    await ensureInternStatusIsCorrect(intern._id);
    console.log('UPDATED CURRENT UNIT:', intern.currentUnit);

    console.log(`Successfully reassigned ${intern.name} to ${selectedUnit.name}`);

    try {
      const recordedWorkload = await createWorkloadHistory(intern._id, selectedUnit._id, 0);
      console.log('Workload history on reassign:', recordedWorkload);
    } catch (workloadError) {
      console.warn('Failed to write workload history during reassignment:', workloadError.message);
    }

    await logActivityEventSafe({
      type: ACTIVITY_TYPES.INTERN_REASSIGNED,
      metadata: {
        internId: intern._id.toString(),
        internName: intern.name,
        previousUnitId,
        previousUnitName,
        nextUnitId: selectedUnit._id.toString(),
        nextUnitName: selectedUnit.name,
        daysInCurrentUnit,
      },
    });

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
    console.log(`Extending intern ${req.params.id} by payload`, req.body);

    const internId = req.params.id;
    if (!internId) {
      return res.status(400).json({ error: 'Intern ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(internId)) {
      return res.status(400).json({ error: 'Intern ID is required' });
    }

    if (req.body.days === undefined || req.body.days === null || req.body.days === '') {
      return res.status(400).json({ error: 'Extension days is required' });
    }

    let days = req.body.days;
    if (typeof days !== 'number') {
      days = Number(days);
    }

    if (!Number.isFinite(days) || Number.isNaN(days) || days <= 0) {
      return res.status(400).json({ error: 'Valid number of days is required' });
    }
    days = Math.floor(days);

    const intern = await Intern.findById(internId).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    await syncInternRotationStates(intern._id);

    let rotation = await Rotation.findOne({
      intern: intern._id,
      status: 'active',
    })
      .exec();

    const allRotations = await Rotation.find({ intern: intern._id })
      .sort({ startDate: 1, createdAt: 1 })
      .exec();

    const lastRotation = allRotations[allRotations.length - 1] || null;

    // Edge case: completed intern with no active rotation can extend the final unit only.
    const completedAllRotations = allRotations.length > 0 && allRotations.every((row) => row.status === 'completed');
    if (!rotation) {
      if (completedAllRotations && lastRotation) {
        rotation = lastRotation;
      } else {
        return res.status(400).json({ error: 'No active rotation found for this intern' });
      }
    }

    const nextDuration = Number(rotation.duration || DEFAULT_ROTATION_DURATION_DAYS) + days;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      return res.status(400).json({ error: 'Extension results in invalid rotation duration' });
    }

    rotation.duration = nextDuration;
    const currentEndDate = rotation.endDate ? startOfDay(rotation.endDate) : recalculateEndDate(rotation.startDate, rotation.duration - days);
    rotation.endDate = addDays(currentEndDate, days);
    await rotation.save();

    if (rotation.status === 'active') {
      const [reservedSequenceKeys, activeUnitLoadMap] = await Promise.all([
        getReservedForwardSequenceKeys(intern._id),
        getActiveUnitLoadMap(),
      ]);
      await rebuildInternFutureRotations({
        internId: intern._id,
        reservedSequenceKeys,
        activeUnitLoadMap,
        now: new Date(),
      });
    }

    intern.extensionDays = Number(intern.extensionDays || 0) + days;
    intern.totalExtensionDays = (intern.totalExtensionDays || 0) + Math.max(days, 0);
    intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
    await intern.save();

    const reasonText = req.body.reason || 'No reason provided';
    const extensionLog = await createExtensionReason(intern._id, days, reasonText);
    console.log('Created extension reason:', extensionLog);

    console.log(`Successfully extended ${intern.name}'s rotation by ${days} days`);
    await logActivityEventSafe({
      type: ACTIVITY_TYPES.INTERN_EXTENSION_ADDED,
      metadata: {
        internId: intern._id.toString(),
        internName: intern.name,
        days,
        reason: reasonText,
      },
    });

    await ensureInternStatusIsCorrect(intern._id);

    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, intern: internView });
  } catch (err) {
    console.error('EXTENSION ERROR:', err);
    res.status(500).json({ success: false, error: 'Failed to extend intern' });
  }
});

module.exports = router;
