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
} = require('../services/rotationPlanService');
const {
  assignFirstUnit,
  ensureContinuousAssignment,
  getEligibleUnits,
  getCompletedUnitIds,
  getUnitOccupancy,
  DEFAULT_CAPACITY,
} = require('../services/dynamicAssignmentService');
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

const normalizeDay = (dateLike) => {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};

const calculateElapsedDays = (startDate, durationDays, todayDate = new Date()) => {
  const start = normalizeDay(startDate);
  const today = normalizeDay(todayDate);
  if (!start || !today) return 0;
  if (today < start) return 0;

  const elapsedDays = Math.floor((today.getTime() - start.getTime()) / DAY_IN_MS) + 1;
  const parsedDuration = Number(durationDays);

  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    return Math.max(0, Math.min(parsedDuration, elapsedDays));
  }

  return Math.max(0, elapsedDays);
};

const getPreservedRotationTimeline = (rotation, fallbackUnit = null) => {
  const fallbackBaseDuration = getUnitDuration(fallbackUnit || rotation?.unit);
  const rawBaseDuration = Number(rotation?.baseDuration);
  const rawExtensionDays = Number(rotation?.extensionDays);
  const rawTotalDuration = Number(rotation?.duration);

  const baseDuration = Number.isFinite(rawBaseDuration) && rawBaseDuration > 0
    ? rawBaseDuration
    : fallbackBaseDuration;
  const extensionDays = Number.isFinite(rawExtensionDays) && rawExtensionDays >= 0
    ? rawExtensionDays
    : 0;

  // Prefer computing totalDuration from actual stored dates — mirrors addUnitProgress logic
  // and is immune to a stale rotation.duration field in the database.
  let totalDuration;
  const rotStart = rotation?.startDate;
  const rotEnd = rotation?.endDate;
  if (rotStart && rotEnd) {
    const startMs = startOfDay(rotStart).getTime();
    const endMs = startOfDay(rotEnd).getTime();
    const dateDiff = Math.round((endMs - startMs) / DAY_IN_MS) + 1;
    if (dateDiff > 0) totalDuration = dateDiff;
  }
  if (!totalDuration) {
    totalDuration = Number.isFinite(rawTotalDuration) && rawTotalDuration > 0
      ? rawTotalDuration
      : baseDuration + extensionDays;
  }

  if (totalDuration < baseDuration + extensionDays) {
    totalDuration = baseDuration + extensionDays;
  }

  return {
    baseDuration,
    extensionDays: Math.max(0, totalDuration - baseDuration),
    totalDuration,
  };
};

const calculateInternshipDay = (startDate, todayDate = new Date()) => {
  const start = normalizeDay(startDate);
  const today = normalizeDay(todayDate);
  if (!start || !today) return 0;
  if (today < start) return 0;
  return Math.floor((today.getTime() - start.getTime()) / DAY_IN_MS) + 1;
};

const recalculateInternTimelineFromStartDate = async (intern, newStartDate, todayDate = new Date()) => {
  const rotations = await Rotation.find({ intern: intern._id })
    .populate('unit', 'name durationDays duration order position')
    .sort({ startDate: 1, createdAt: 1 })
    .exec();

  if (rotations.length === 0) {
    intern.currentUnit = null;
    await intern.save();
    return;
  }

  const start = normalizeDay(newStartDate);
  const today = normalizeDay(todayDate);
  const daysInInternship = calculateInternshipDay(start, today);

  const durations = rotations.map((rotation) => getUnitDuration(rotation.unit));

  let currentIndex = -1;
  let currentElapsedDays = 0;
  let remainingDays = daysInInternship;

  for (let index = 0; index < rotations.length; index += 1) {
    const duration = durations[index];
    if (remainingDays >= duration) {
      remainingDays -= duration;
      continue;
    }

    currentIndex = index;
    // Exact-boundary case should move to next unit on Day 1.
    currentElapsedDays = Math.max(1, remainingDays);
    break;
  }

  const allCompleted = daysInInternship > 0 && currentIndex === -1;
  const hasStarted = daysInInternship > 0;
  let cursor = new Date(start);

  for (let index = 0; index < rotations.length; index += 1) {
    const rotation = rotations[index];
    const duration = durations[index];

    let rotationStartDate = new Date(cursor);
    let rotationEndDate = recalculateEndDate(rotationStartDate, duration);
    let status = 'upcoming';

    if (!hasStarted) {
      status = 'upcoming';
    } else if (allCompleted) {
      status = 'completed';
    } else if (index < currentIndex) {
      status = 'completed';
    } else if (index === currentIndex) {
      status = 'active';
      rotationStartDate = addDays(today, -(currentElapsedDays - 1));
      rotationEndDate = recalculateEndDate(rotationStartDate, duration);
    } else {
      status = 'upcoming';
    }

    rotation.startDate = rotationStartDate;
    rotation.endDate = rotationEndDate;
    rotation.baseDuration = duration;
    rotation.duration = duration;
    rotation.extensionDays = 0;
    rotation.status = status;
    await rotation.save();

    cursor = addDays(rotationEndDate, 1);
  }

  if (allCompleted) {
    intern.currentUnit = null;
    intern.status = 'completed';
  } else if (currentIndex >= 0) {
    const activeRotation = rotations[currentIndex];
    intern.currentUnit = activeRotation.unit?._id || activeRotation.unit;
    intern.status = 'active';
  } else {
    intern.currentUnit = null;
    intern.status = 'active';
  }

  const rotationHistory = await Rotation.find({ intern: intern._id })
    .sort({ startDate: 1, createdAt: 1 })
    .select('_id')
    .exec();
  intern.rotationHistory = rotationHistory.map((rotation) => rotation._id);

  await intern.save();
};

const toComparableInternValue = (field, value) => {
  if (field === 'startDate') {
    const parsed = toValidDate(value);
    return parsed ? startOfDay(parsed).toISOString() : null;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value ?? null;
};

const toInternDisplayValue = (field, value) => {
  if (value === null || value === undefined || value === '') {
    return 'none';
  }

  if (field === 'batch') {
    return `Batch ${String(value).trim()}`;
  }

  if (field === 'startDate') {
    const parsed = toValidDate(value);
    return parsed ? startOfDay(parsed).toISOString().slice(0, 10) : 'none';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value);
};

const buildInternChange = (field, label, oldValue, newValue) => ({
  field,
  label,
  oldValue,
  newValue,
  oldDisplayValue: toInternDisplayValue(field, oldValue),
  newDisplayValue: toInternDisplayValue(field, newValue),
});

const buildInternUpdateMessage = (previousIntern, updatedIntern, changes) => {
  const oldName = previousIntern?.name || 'Intern';
  const newName = updatedIntern?.name || oldName;
  const nameChange = changes.find((change) => change.field === 'name') || null;
  const batchChange = changes.find((change) => change.field === 'batch') || null;

  if (changes.length === 1 && nameChange) {
    return `Intern name updated: ${oldName} to ${newName}`;
  }

  if (changes.length === 1 && batchChange) {
    return `${oldName} was moved from ${batchChange.oldDisplayValue} to ${batchChange.newDisplayValue}`;
  }

  const parts = changes.map((change) => {
    if (change.field === 'name') {
      return `name changed to ${newName}`;
    }
    if (change.field === 'batch') {
      return `batch changed from ${change.oldDisplayValue} to ${change.newDisplayValue}`;
    }
    return `${change.label} changed from ${change.oldDisplayValue} to ${change.newDisplayValue}`;
  });

  return `${oldName} was updated: ${parts.join(', ')}`;
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
  const ensured = await ensureContinuousAssignment(internId, now);
  const activeRotationId = ensured?.rotation?._id?.toString?.() || null;
  const rotations = await Rotation.find({ intern: internId }).sort({ startDate: 1, createdAt: 1 }).exec();

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

    let nextStatus = 'completed';
    if (activeRotationId && rotation._id.toString() === activeRotationId) {
      nextStatus = 'active';
    } else if (startDate > now) {
      nextStatus = 'upcoming';
    } else if (endDate < now) {
      nextStatus = 'completed';
    }

    if (rotation.status !== nextStatus) {
      rotation.status = nextStatus;
      await rotation.save();
    } else if (rotation.isModified()) {
      await rotation.save();
    }
  }

  const intern = await Intern.findById(internId).exec();
  if (!intern) {
    throw new Error('Intern not found');
  }

  const current = rotations.find((rotation) => rotation._id.toString() === activeRotationId) || null;
  const upcoming = rotations.filter((rotation) => rotation.status === 'upcoming');
  const completed = rotations.filter((rotation) => rotation.status === 'completed');

  intern.currentUnit = current?.unit || null;
  if (current) {
    intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
  } else {
    intern.status = 'completed';
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
  const activeStartDate = activeRotation?.startDate || activeRotation?.start_date || null;
  const activeDuration = Number(
    activeRotation?.duration
    || activeRotation?.duration_days
    || activeRotation?.unit?.duration
    || activeRotation?.unit?.durationDays
    || activeRotation?.unit?.duration_days
    || DEFAULT_ROTATION_DURATION_DAYS
  );
  const currentUnitElapsedDays = calculateElapsedDays(activeStartDate, activeDuration);
  const internshipDays = calculateElapsedDays(intern.startDate || intern.start_date, null);

  const currentUnit = intern.currentUnit || null;
  const currentUnitWithProgress = currentUnit
    ? {
      ...currentUnit,
      startDate: activeStartDate,
      start_date: activeStartDate,
      duration: activeDuration,
      duration_days: activeDuration,
      elapsedDays: currentUnitElapsedDays,
      elapsed_days: currentUnitElapsedDays,
    }
    : null;

  return {
    ...intern,
    batch: intern.batch || null,
    status: derivedStatus,
    currentUnit: currentUnitWithProgress,
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
    const internIds = await Intern.find().select('_id').lean().exec();
    await Promise.all(internIds.map(({ _id }) => syncInternRotationStates(_id).catch((error) => {
      console.error('❌ Error syncing intern rotation state:', _id?.toString?.() || _id, error);
    })));

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
      const duration = Number(currentRotation.duration || DEFAULT_ROTATION_DURATION_DAYS);
      const daysSpent = calculateElapsedDays(currentRotation.startDate, duration, new Date());
      progress = `${daysSpent}/${duration}`;
    }

    const current = currentRotation ? formatRotationForSchedule(currentRotation) : null;
    const upcoming = upcomingRotations.map(formatRotationForSchedule);
    const completed = completedRotations.map(formatRotationForSchedule);

    console.log('UPCOMING:', upcoming);

    const internView = await buildInternView(req.params.id);

    const currentUnitId = currentRotation?.unit?._id?.toString?.() || currentRotation?.unit?.toString?.() || null;
    const eligibleUnits = await getEligibleUnits(req.params.id, currentUnitId);

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
      eligibleUnits,
    });
  } catch (err) {
    console.error('Error fetching intern schedule:', err);
    res.status(500).json({ error: 'Failed to fetch intern schedule' });
  }
});

// GET /api/interns/:id - Get a single intern
router.get('/:id', async (req, res) => {
  try {
    await syncInternRotationStates(req.params.id);
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

    const units = await getOrderedUnits();
    if (units.length === 0) {
      return res.status(400).json({ error: 'No units configured. Please add units before creating interns.' });
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

    // Dynamic assignment: pick unit with lowest occupancy (capacity = 5)
    const { rotation, unit } = await assignFirstUnit(intern, units);

    intern.currentUnit = unit._id;
    intern.rotationHistory = [rotation._id];
    await intern.save();

    await syncInternRotationStates(intern._id);
    console.log(`[POST /interns] Dynamically assigned first unit: "${unit.name}" for ${intern.name}`);

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
    const previousIntern = intern.toObject();

    if (req.body.startDate !== undefined) {
      const parsedStartDate = toValidDate(req.body.startDate);
      if (!parsedStartDate) {
        return res.status(400).json({ error: 'Invalid start date' });
      }
      req.body.startDate = parsedStartDate;
    }

    const previousStartDate = toValidDate(intern.startDate);
    const updates = ['name', 'gender', 'batch', 'startDate', 'phone', 'status', 'extensionDays', 'totalExtensionDays'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) {
        intern[field] = req.body[field];
      }
    });

    await intern.save();

    const nextStartDate = toValidDate(intern.startDate);
    const startDateChanged = previousStartDate && nextStartDate
      ? startOfDay(previousStartDate).getTime() !== startOfDay(nextStartDate).getTime()
      : Boolean(previousStartDate || nextStartDate);

    if (startDateChanged && nextStartDate) {
      await recalculateInternTimelineFromStartDate(intern, nextStartDate, new Date());
    }

    await ensureInternStatusIsCorrect(intern._id);

    const trackedFields = [
      { field: 'name', label: 'name' },
      { field: 'batch', label: 'batch' },
      { field: 'gender', label: 'gender' },
      { field: 'startDate', label: 'start date' },
      { field: 'phone', label: 'phone' },
      { field: 'status', label: 'status' },
      { field: 'extensionDays', label: 'extension days' },
      { field: 'totalExtensionDays', label: 'total extension days' },
    ];
    const changes = [];
    for (const item of trackedFields) {
      const oldValue = toComparableInternValue(item.field, previousIntern[item.field]);
      const newValue = toComparableInternValue(item.field, intern[item.field]);
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push(buildInternChange(item.field, item.label, oldValue, newValue));
      }
    }

    if (changes.length > 0) {
      const message = buildInternUpdateMessage(previousIntern, intern, changes);
      await logActivityEventSafe({
        type: ACTIVITY_TYPES.INTERN_UPDATE,
        metadata: {
          entityId: intern._id.toString(),
          internId: intern._id.toString(),
          internName: intern.name,
          message,
          changes,
        },
      });
    }

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

    const previousUnitId = current.unit?._id?.toString?.() || current.unit?.toString?.() || intern.currentUnit?.toString?.() || null;
    const previousUnitName = current.unit?.name || 'Unknown unit';

    if (previousUnitId && String(previousUnitId) === String(unitId)) {
      return res.status(400).json({ error: 'Cannot reassign to the current unit' });
    }

    // Validate: selected unit must be eligible (not completed, not current, not at capacity)
    const completedIds = await getCompletedUnitIds(intern._id);
    if (completedIds.has(String(unitId))) {
      return res.status(400).json({ error: 'Cannot reassign to a unit already completed by this intern' });
    }
    const occupancy = await getUnitOccupancy();
    const currentOccupancy = occupancy.get(String(unitId)) || 0;
    if (currentOccupancy >= DEFAULT_CAPACITY) {
      return res.status(400).json({ error: `Unit "${selectedUnit.name}" is at full capacity (${DEFAULT_CAPACITY} interns)` });
    }

    const preservedStartDate = toValidDate(current.startDate) || startOfDay(new Date());
    const previousTimeline = getPreservedRotationTimeline(current, current.unit);
    const daysInCurrentUnit = calculateElapsedDays(preservedStartDate, previousTimeline.totalDuration, new Date());
    const selectedUnitDuration = getUnitDuration(selectedUnit);

    // Update the active rotation to the new unit, preserving start date and duration slot
    current.unit = selectedUnit._id;
    current.baseDuration = selectedUnitDuration;
    current.extensionDays = 0;
    current.duration = selectedUnitDuration;
    current.startDate = preservedStartDate;
    current.endDate = recalculateEndDate(current.startDate, selectedUnitDuration);
    current.status = 'active';
    await current.save();

    // Delete all pre-generated upcoming rotations (there should be none in the new system,
    // but clean up any legacy records that may exist)
    await Rotation.deleteMany({ intern: intern._id, status: 'upcoming' }).exec();

    const rotationHistory = await Rotation.find({ intern: intern._id })
      .sort({ startDate: 1, createdAt: 1 })
      .select('_id')
      .exec();

    intern.currentUnit = selectedUnit._id;
    intern.rotationHistory = rotationHistory.map((rotation) => rotation._id);
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
      .populate('unit')
      .exec();

    const allRotations = await Rotation.find({ intern: intern._id })
      .populate('unit')
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

    // Initialize baseDuration from unit if not yet set (backward compat for existing rotations)
    if (!rotation.baseDuration) {
      const unitBaseDuration = rotation.unit ? getUnitDuration(rotation.unit) : Number(rotation.duration || DEFAULT_ROTATION_DURATION_DAYS);
      rotation.baseDuration = unitBaseDuration;
      // If duration is already larger than unitBaseDuration, preserve existing extension
      rotation.extensionDays = Math.max(0, Number(rotation.duration || DEFAULT_ROTATION_DURATION_DAYS) - unitBaseDuration);
    }

    rotation.extensionDays = Number(rotation.extensionDays || 0) + days;
    const totalDuration = rotation.baseDuration + rotation.extensionDays;

    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
      return res.status(400).json({ error: 'Extension results in invalid rotation duration' });
    }

    rotation.duration = totalDuration;
    rotation.endDate = recalculateEndDate(rotation.startDate, totalDuration);
    await rotation.save();

    if (rotation.status === 'active') {
      // Dynamic system: no upcoming rotations to rebuild. Extension only affects
      // this active rotation's endDate, which was already saved above.
    }
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

// POST /api/interns/:id/remove-extension - Remove (reduce) extension days from active rotation
router.post('/:id/remove-extension', async (req, res) => {
  try {
    const internId = req.params.id;
    if (!internId || !mongoose.Types.ObjectId.isValid(internId)) {
      return res.status(400).json({ error: 'Intern ID is required' });
    }

    if (req.body.days === undefined || req.body.days === null || req.body.days === '') {
      return res.status(400).json({ error: 'Days to remove is required' });
    }

    let days = typeof req.body.days !== 'number' ? Number(req.body.days) : req.body.days;
    if (!Number.isFinite(days) || Number.isNaN(days) || days <= 0) {
      return res.status(400).json({ error: 'Valid number of days is required' });
    }
    days = Math.floor(days);

    const intern = await Intern.findById(internId).exec();
    if (!intern) return res.status(404).json({ error: 'Intern not found' });

    await syncInternRotationStates(intern._id);

    let rotation = await Rotation.findOne({ intern: intern._id, status: 'active' })
      .populate('unit')
      .exec();

    if (!rotation) {
      const allRotations = await Rotation.find({ intern: intern._id })
        .populate('unit')
        .sort({ startDate: -1 })
        .exec();
      const lastRotation = allRotations[0] || null;
      const completedAllRotations = allRotations.length > 0 && allRotations.every((row) => row.status === 'completed');
      if (completedAllRotations && lastRotation) {
        rotation = lastRotation;
      } else {
        return res.status(400).json({ error: 'No active rotation found for this intern' });
      }
    }

    // Initialize baseDuration if not yet set (backward compat)
    if (!rotation.baseDuration) {
      const unitBaseDuration = rotation.unit ? getUnitDuration(rotation.unit) : Number(rotation.duration || DEFAULT_ROTATION_DURATION_DAYS);
      rotation.baseDuration = unitBaseDuration;
      rotation.extensionDays = Math.max(0, Number(rotation.duration || DEFAULT_ROTATION_DURATION_DAYS) - unitBaseDuration);
    }

    const currentExtensionDays = Number(rotation.extensionDays || 0);
    const removeDays = Math.min(days, currentExtensionDays);

    rotation.extensionDays = Math.max(0, currentExtensionDays - removeDays);
    const totalDuration = rotation.baseDuration + rotation.extensionDays;

    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
      return res.status(400).json({ error: 'Removal results in invalid rotation duration' });
    }

    rotation.duration = totalDuration;
    rotation.endDate = recalculateEndDate(rotation.startDate, totalDuration);
    await rotation.save();

    if (rotation.status === 'active') {
      // Dynamic system: no upcoming rotations to rebuild. Extension removal only affects
      // this active rotation's endDate, which was already saved above.
    }

    const internExtensionDays = Number(intern.extensionDays || 0);
    intern.extensionDays = Math.max(0, internExtensionDays - removeDays);
    intern.status = Number(intern.extensionDays || 0) > 0 ? 'extended' : 'active';
    await intern.save();

    const reasonText = req.body.reason || 'No reason provided';
    await logActivityEventSafe({
      type: ACTIVITY_TYPES.INTERN_EXTENSION_REMOVED,
      metadata: {
        internId: intern._id.toString(),
        internName: intern.name,
        days: removeDays,
        reason: reasonText,
      },
    });

    await ensureInternStatusIsCorrect(intern._id);
    await updateBatchStats().catch(() => {});

    const internView = await buildInternView(intern._id);
    res.json({ success: true, removedDays: removeDays, intern: internView });
  } catch (err) {
    console.error('REMOVE EXTENSION ERROR:', err);
    res.status(500).json({ success: false, error: 'Failed to remove extension' });
  }
});

module.exports = router;
