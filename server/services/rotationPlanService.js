const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

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

const toValidDate = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getUnitDuration = (unitDoc) => {
  const raw = unitDoc?.duration ?? unitDoc?.durationDays ?? unitDoc?.duration_days;
  const duration = Number(raw);
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_ROTATION_DURATION_DAYS;
};

const getUnitOrderIndex = (unitDoc) => {
  const raw = unitDoc?.orderIndex ?? unitDoc?.order ?? unitDoc?.position;
  const orderIndex = Number(raw);
  return Number.isFinite(orderIndex) ? orderIndex : Number.MAX_SAFE_INTEGER;
};

const recalculateEndDate = (startDate, duration) => addDays(startOfDay(startDate), Number(duration || 0) - 1);

const sortUnitsByOrder = (units = []) => [...units].sort((left, right) => {
  const orderDifference = getUnitOrderIndex(left) - getUnitOrderIndex(right);
  if (orderDifference !== 0) return orderDifference;

  const leftName = String(left?.name || '');
  const rightName = String(right?.name || '');
  return leftName.localeCompare(rightName);
});

const getOrderedUnits = async () => {
  const units = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
  return sortUnitsByOrder(units);
};

const hashString = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return hash >>> 0;
};

const createSeededRandom = (seed) => {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const isRotationFinalized = (rotation) => {
  if (!rotation) return false;
  if (rotation.status === 'completed') return true;
  if (rotation.actualEndDate) return true;
  return false;
};

const buildForwardSequenceKey = (anchorUnitId, upcomingUnits = []) => {
  const sequence = [anchorUnitId, ...upcomingUnits.map((unit) => unit?._id?.toString?.() || unit?.id?.toString?.() || null)]
    .filter(Boolean)
    .map((value) => String(value));

  return sequence.join('>');
};

const getDerivedRotationStatus = (rotation, today = startOfDay(new Date())) => {
  if (!rotation) return 'upcoming';
  if (isRotationFinalized(rotation)) return 'completed';
  if (rotation.status === 'awaiting_confirmation') return 'awaiting_confirmation';

  const startDate = rotation?.startDate ? startOfDay(rotation.startDate) : null;
  const endDate = rotation?.endDate ? startOfDay(rotation.endDate) : null;

  if (!startDate) return 'upcoming';
  if (startDate > today) return 'upcoming';
  if (!endDate || endDate >= today) return 'active';
  return 'completed';
};

const computeDeterministicProgress = (internStartDate, orderedUnits = [], now = new Date()) => {
  const normalizedStartDate = toValidDate(internStartDate);
  if (!normalizedStartDate || orderedUnits.length === 0) {
    return {
      completedUnits: [],
      currentUnit: null,
      currentIndex: -1,
      hasStarted: false,
      allCompleted: false,
    };
  }

  const startDate = startOfDay(normalizedStartDate);
  const today = startOfDay(now);
  if (startDate > today) {
    return {
      completedUnits: [],
      currentUnit: null,
      currentIndex: -1,
      hasStarted: false,
      allCompleted: false,
    };
  }

  const daysSinceStart = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / DAY_IN_MS));
  let elapsedDays = 0;

  for (let index = 0; index < orderedUnits.length; index += 1) {
    const unit = orderedUnits[index];
    const duration = getUnitDuration(unit);
    if (daysSinceStart < elapsedDays + duration) {
      return {
        completedUnits: orderedUnits.slice(0, index),
        currentUnit: unit,
        currentIndex: index,
        hasStarted: true,
        allCompleted: false,
      };
    }
    elapsedDays += duration;
  }

  return {
    completedUnits: [...orderedUnits],
    currentUnit: null,
    currentIndex: -1,
    hasStarted: true,
    allCompleted: true,
  };
};

const getShuffledUnits = (units, seed, activeUnitLoadMap = new Map()) => {
  const random = createSeededRandom(seed);
  return [...units]
    .map((unit) => ({
      unit,
      activeLoad: Number(activeUnitLoadMap.get(String(unit._id))) || 0,
      weight: random(),
    }))
    .sort((left, right) => {
      const loadDifference = left.activeLoad - right.activeLoad;
      if (loadDifference !== 0) return loadDifference;
      if (left.weight !== right.weight) return left.weight - right.weight;
      return getUnitOrderIndex(left.unit) - getUnitOrderIndex(right.unit);
    })
    .map(({ unit }) => unit);
};

const chooseUniqueUpcomingUnits = ({
  intern,
  anchorUnitId,
  remainingUnits,
  reservedSequenceKeys,
  activeUnitLoadMap,
  orderSignature,
  maxRetries = 24,
}) => {
  const normalizedRemainingUnits = Array.isArray(remainingUnits) ? remainingUnits : [];
  if (normalizedRemainingUnits.length <= 1) {
    const sequenceKey = buildForwardSequenceKey(anchorUnitId, normalizedRemainingUnits);
    if (sequenceKey) reservedSequenceKeys.add(sequenceKey);
    return normalizedRemainingUnits;
  }

  let fallbackUnits = normalizedRemainingUnits;
  let fallbackKey = buildForwardSequenceKey(anchorUnitId, fallbackUnits);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const attemptSeed = [
      intern?._id?.toString?.() || intern?.id || 'intern',
      intern?.createdAt?.toISOString?.() || intern?.startDate?.toISOString?.() || '',
      orderSignature,
      attempt,
    ].join('|');

    const shuffledUnits = getShuffledUnits(normalizedRemainingUnits, attemptSeed, activeUnitLoadMap);
    const sequenceKey = buildForwardSequenceKey(anchorUnitId, shuffledUnits);

    fallbackUnits = shuffledUnits;
    fallbackKey = sequenceKey;

    if (!sequenceKey || !reservedSequenceKeys.has(sequenceKey)) {
      if (sequenceKey) reservedSequenceKeys.add(sequenceKey);
      return shuffledUnits;
    }
  }

  if (fallbackKey) reservedSequenceKeys.add(fallbackKey);
  return fallbackUnits;
};

const syncRotationHistory = async (internId) => {
  const allRotations = await Rotation.find({ intern: internId }).sort({ startDate: 1 }).select('_id').exec();
  await Intern.findByIdAndUpdate(internId, {
    rotationHistory: allRotations.map((rotation) => rotation._id),
  }).exec();
};

const getActiveUnitLoadMap = async () => {
  const today = startOfDay(new Date());
  const rotations = await Rotation.find({ status: 'active' }).select('unit startDate endDate').exec();
  const counts = new Map();

  for (const rotation of rotations) {
    const derivedStatus = getDerivedRotationStatus(rotation, today);
    if (derivedStatus !== 'active') continue;
    const unitId = rotation?.unit?.toString?.() || null;
    if (!unitId) continue;
    counts.set(unitId, (counts.get(unitId) || 0) + 1);
  }

  return counts;
};

const getReservedForwardSequenceKeys = async (excludeInternId = null) => {
  const query = { status: { $in: ['active', 'upcoming', 'awaiting_confirmation'] } };
  if (excludeInternId) {
    query.intern = { $ne: excludeInternId };
  }

  const rotations = await Rotation.find(query)
    .sort({ startDate: 1, createdAt: 1 })
    .select('intern unit')
    .exec();

  const rotationsByIntern = new Map();
  for (const rotation of rotations) {
    const internId = rotation?.intern?.toString?.() || null;
    const unitId = rotation?.unit?.toString?.() || null;
    if (!internId || !unitId) continue;

    const unitIds = rotationsByIntern.get(internId) || [];
    unitIds.push(unitId);
    rotationsByIntern.set(internId, unitIds);
  }

  return new Set(
    [...rotationsByIntern.values()]
      .map((unitIds) => unitIds.join('>'))
      .filter(Boolean)
  );
};

const buildInitialRotationPlanForIntern = async ({
  intern,
  units,
  nextInternIndex,
  reservedSequenceKeys,
  activeUnitLoadMap,
  now = new Date(),
}) => {
  const orderedUnits = sortUnitsByOrder(Array.isArray(units) ? units : []);
  if (orderedUnits.length === 0) {
    return [];
  }

  const startDate = startOfDay(intern.startDate || now);
  const today = startOfDay(now);
  const orderSignature = orderedUnits.map((unit) => `${unit._id}:${getUnitOrderIndex(unit)}`).join('|');

  let sequence = [];
  let progress = computeDeterministicProgress(startDate, orderedUnits, today);
  let currentIndex = -1;

  if (nextInternIndex != null) {
    const firstUnitIndex = Number(nextInternIndex);
    const firstUnit = orderedUnits[firstUnitIndex] || orderedUnits[0] || null;
    const remainingUnits = orderedUnits.filter((unit) => String(unit._id) !== String(firstUnit?._id));

    const shuffledRemainingUnits = chooseUniqueUpcomingUnits({
      intern,
      anchorUnitId: firstUnit?._id?.toString?.() || null,
      remainingUnits,
      reservedSequenceKeys,
      activeUnitLoadMap,
      orderSignature,
    });

    sequence = [firstUnit, ...shuffledRemainingUnits].filter(Boolean);
    progress = computeDeterministicProgress(startDate, sequence, today);
    currentIndex = progress.currentIndex;
  } else if (progress.allCompleted) {
    sequence = [...orderedUnits];
  } else {
    const completedUnits = progress.completedUnits;
    const currentUnit = progress.currentUnit;
    const completedUnitIds = new Set(completedUnits.map((unit) => String(unit._id)));

    const remainingUnits = orderedUnits.filter((unit) => {
      const unitId = String(unit._id);
      if (completedUnitIds.has(unitId)) return false;
      if (currentUnit && unitId === String(currentUnit._id)) return false;
      return true;
    });

    const shuffledRemainingUnits = chooseUniqueUpcomingUnits({
      intern,
      anchorUnitId: currentUnit?._id?.toString?.() || null,
      remainingUnits,
      reservedSequenceKeys,
      activeUnitLoadMap,
      orderSignature,
    });

    sequence = [...completedUnits, currentUnit, ...shuffledRemainingUnits].filter(Boolean);
    currentIndex = completedUnits.length;
  }

  const uniqueUnitIds = new Set(sequence.map((unit) => String(unit._id)));
  if (uniqueUnitIds.size !== orderedUnits.length) {
    throw new Error('Generated unit sequence failed full coverage validation');
  }

  const documents = [];
  let cursor = new Date(startDate);

  for (let index = 0; index < sequence.length; index += 1) {
    const unit = sequence[index];
    const duration = getUnitDuration(unit);
    const rotationStartDate = new Date(cursor);
    const rotationEndDate = recalculateEndDate(rotationStartDate, duration);

    let status = 'upcoming';
    if (progress.allCompleted) {
      status = 'completed';
    } else if (!progress.hasStarted) {
      status = 'upcoming';
    } else if (index < currentIndex) {
      status = 'completed';
    } else if (index === currentIndex) {
      status = 'active';
    }

    documents.push({
      intern: intern._id,
      unit: unit._id,
      startDate: rotationStartDate,
      endDate: rotationEndDate,
      baseDuration: duration,
      extensionDays: 0,
      duration,
      status,
    });

    cursor = addDays(rotationEndDate, 1);
  }

  return Rotation.create(documents);
};

const rebuildInternFutureRotations = async ({
  internId,
  units,
  reservedSequenceKeys,
  activeUnitLoadMap,
  now = new Date(),
}) => {
  const [intern, rotations, orderedUnits] = await Promise.all([
    Intern.findById(internId).exec(),
    Rotation.find({ intern: internId }).populate('unit').sort({ startDate: 1, createdAt: 1 }).exec(),
    Array.isArray(units) ? Promise.resolve(sortUnitsByOrder(units)) : getOrderedUnits(),
  ]);

  if (!intern) {
    throw new Error('Intern not found');
  }

  const today = startOfDay(now);
  const { trace } = require('./mutationTraceService');
  const completedRotations = [];
  let activeRotation = null;
  const existingUpcomingRotations = [];

  // Trace initial rotation list
  trace('rebuildInternFutureRotations:initial', internId, {
    rotations: rotations.map(r => ({ id: r._id.toString(), status: r.status, unit: r.unit?._id?.toString?.() || r.unit })),
  });

  for (const rotation of rotations) {
    const isAwaitingConfirmation = rotation.status === 'awaiting_confirmation';
    const isFinalized = isRotationFinalized(rotation);
    const derivedStatus = isFinalized
      ? 'completed'
      : isAwaitingConfirmation
      ? 'awaiting_confirmation'
      : getDerivedRotationStatus(rotation, today);

    if (rotation.status !== derivedStatus) {
      rotation.status = derivedStatus;
      await rotation.save();
    }

    if (derivedStatus === 'completed') {
      completedRotations.push(rotation);
      trace('rebuildInternFutureRotations:collected_completed', internId, { rotation: { id: rotation._id.toString(), unit: rotation.unit?._id?.toString?.() || rotation.unit } });
      continue;
    }

    if (derivedStatus === 'active' && !activeRotation) {
      activeRotation = rotation;
      continue;
    }

    if (derivedStatus !== 'awaiting_confirmation') {
      // Only add truly upcoming rotations to existingUpcomingRotations, not awaiting_confirmation
      existingUpcomingRotations.push(rotation);
      trace('rebuildInternFutureRotations:existing_upcoming_add', internId, { rotation: { id: rotation._id.toString(), unit: rotation.unit?._id?.toString?.() || rotation.unit } });
    }
  }

  const completedUnitIds = new Set(
    completedRotations.map((rotation) => rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.()).filter(Boolean)
  );

  const stagedFutureUnitIds = new Set(
    rotations
      .filter((rotation) => ['awaiting_confirmation', 'upcoming'].includes(rotation.status))
      .map((rotation) => rotation?.unit?._id?.toString?.() || rotation?.unit?.toString?.())
      .filter(Boolean)
  );

  const allUnitIds = new Set(orderedUnits.map((unit) => String(unit._id)));
  const completedCount = [...completedUnitIds].filter((unitId) => allUnitIds.has(unitId)).length;
  const allCompleted = orderedUnits.length > 0 && completedCount >= orderedUnits.length;
  const orderSignature = orderedUnits.map((unit) => `${unit._id}:${getUnitOrderIndex(unit)}`).join('|');

  let desiredUpcomingUnits = [];
  let previousEndDate = addDays(startOfDay(intern.startDate || now), -1);

  if (activeRotation) {
    previousEndDate = startOfDay(activeRotation.endDate || recalculateEndDate(activeRotation.startDate, activeRotation.duration));

    const currentUnitId = activeRotation?.unit?._id?.toString?.() || activeRotation?.unit?.toString?.() || null;
    const remainingUnits = orderedUnits.filter((unit) => {
      const unitId = String(unit._id);
      if (completedUnitIds.has(unitId)) return false;
      if (unitId === String(currentUnitId)) return false;
      if (stagedFutureUnitIds.has(unitId)) return false;
      return true;
    });

    desiredUpcomingUnits = chooseUniqueUpcomingUnits({
      intern,
      anchorUnitId: currentUnitId,
      remainingUnits,
      reservedSequenceKeys,
      activeUnitLoadMap,
      orderSignature,
    });

    intern.currentUnit = activeRotation.unit?._id || activeRotation.unit;
  } else if (!allCompleted) {
    const firstRemainingUnit = orderedUnits.find((unit) => {
      const unitId = String(unit._id);
      if (completedUnitIds.has(unitId)) return false;
      if (stagedFutureUnitIds.has(unitId)) return false;
      return true;
    }) || null;
    const remainingUnits = orderedUnits.filter((unit) => {
      const unitId = String(unit._id);
      if (completedUnitIds.has(unitId)) return false;
      if (stagedFutureUnitIds.has(unitId)) return false;
      return !firstRemainingUnit || unitId !== String(firstRemainingUnit._id);
    });

    const shuffledRemainingUnits = chooseUniqueUpcomingUnits({
      intern,
      anchorUnitId: firstRemainingUnit?._id?.toString?.() || null,
      remainingUnits,
      reservedSequenceKeys,
      activeUnitLoadMap,
      orderSignature,
    });

    desiredUpcomingUnits = [firstRemainingUnit, ...shuffledRemainingUnits].filter(Boolean);

    const lastCompletedRotation = completedRotations[completedRotations.length - 1] || null;
    if (lastCompletedRotation?.endDate) {
      previousEndDate = startOfDay(lastCompletedRotation.endDate);
    }

    intern.currentUnit = null;
  } else {
    intern.currentUnit = null;
  }

  const createdUpcomingRotations = [];

  // Preserve already scheduled upcoming rotations as immutable.
  // Do not update or resave existing upcoming documents.
  if (existingUpcomingRotations.length > 0) {
    const lastUpcomingRotation = existingUpcomingRotations[existingUpcomingRotations.length - 1];
    if (lastUpcomingRotation?.endDate) {
      previousEndDate = startOfDay(lastUpcomingRotation.endDate);
    }
  }

  while (existingUpcomingRotations.length < desiredUpcomingUnits.length) {
    const newUnitForCreate = desiredUpcomingUnits[existingUpcomingRotations.length];
    const newUnitDuration = getUnitDuration(newUnitForCreate);
    const createdRotation = await Rotation.create({
      intern: intern._id,
      unit: newUnitForCreate._id,
      startDate: addDays(previousEndDate, 1),
      endDate: recalculateEndDate(addDays(previousEndDate, 1), newUnitDuration),
      baseDuration: newUnitDuration,
      extensionDays: 0,
      duration: newUnitDuration,
      status: 'upcoming',
    });
    existingUpcomingRotations.push(createdRotation);
    createdUpcomingRotations.push(createdRotation);
    previousEndDate = startOfDay(createdRotation.endDate);
    trace('rebuildInternFutureRotations:created_upcoming', internId, { index: existingUpcomingRotations.length - 1, rotation: { id: createdRotation._id.toString(), unit: createdRotation.unit?.toString?.() || createdRotation.unit, startDate: createdRotation.startDate, endDate: createdRotation.endDate, status: createdRotation.status } });
  }

  if (allCompleted) {
    intern.status = 'completed';
  } else if (Number(intern.extensionDays || 0) > 0) {
    intern.status = 'extended';
  } else {
    intern.status = 'active';
  }

  await intern.save();
  await syncRotationHistory(intern._id);

  const validationErrors = [];
  const upcomingIds = existingUpcomingRotations
    .map((rotation) => String(rotation._id))
    .filter(Boolean);

  if (new Set(upcomingIds).size !== upcomingIds.length) {
    validationErrors.push('duplicate upcoming rotations detected');
  }

  if (rotations.filter((rotation) => rotation.status === 'active').length > 1) {
    validationErrors.push('multiple active rotations found for intern');
  }

  if (completedRotations.some((rotation) => rotation.status !== 'completed')) {
    validationErrors.push('finalized rotations were reclassified incorrectly');
  }

  if (validationErrors.length > 0) {
    const message = `Rotation rebuild validation failed for intern ${internId}: ${validationErrors.join('; ')}`;
    if (process.env.NODE_ENV === 'production') {
      console.error(message);
    } else {
      throw new Error(message);
    }
  }

  return {
    currentRotation: activeRotation,
    upcomingRotations: existingUpcomingRotations,
    createdUpcomingRotations,
  };
};

const reshuffleAllUpcoming = async () => {
  const internIds = await Rotation.distinct('intern', {
    status: { $in: ['active', 'upcoming', 'awaiting_confirmation'] },
  }).exec();

  const activeUnitLoadMap = await getActiveUnitLoadMap();
  const reservedSequenceKeys = new Set();
  const results = [];
  const { trace } = require('./mutationTraceService');

  const sortedInternIds = [...new Set((internIds || []).map((id) => String(id)))].sort();

  for (const internId of sortedInternIds) {
    trace('reshuffleAllUpcoming:start_intern', internId, { reservedSequenceCount: reservedSequenceKeys.size });
    const reservedKeysForOthers = await getReservedForwardSequenceKeys(internId);
    for (const key of reservedKeysForOthers) {
      reservedSequenceKeys.add(key);
    }

    const rebuildResult = await rebuildInternFutureRotations({
      internId,
      reservedSequenceKeys,
      activeUnitLoadMap,
    });

    results.push({
      internId,
      upcomingCount: rebuildResult.upcomingRotations.length,
      createdUpcomingCount: rebuildResult.createdUpcomingRotations.length,
    });
  }

  return {
    rebuiltInternCount: results.length,
    results,
  };
};

module.exports = {
  DEFAULT_ROTATION_DURATION_DAYS,
  DAY_IN_MS,
  startOfDay,
  addDays,
  toValidDate,
  getUnitDuration,
  getUnitOrderIndex,
  recalculateEndDate,
  sortUnitsByOrder,
  getOrderedUnits,
  computeDeterministicProgress,
  getActiveUnitLoadMap,
  reshuffleAllUpcoming,
};