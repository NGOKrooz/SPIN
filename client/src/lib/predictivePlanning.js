import { formatDate, normalizeDate } from './utils';

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const DEFAULT_CAPACITY = 5;
const DEFAULT_DURATION_DAYS = 20;

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const addDays = (dateLike, days) => {
  const value = toDate(dateLike);
  if (!value) return null;
  value.setDate(value.getDate() + Number(days || 0));
  return value;
};

const getId = (value) => {
  if (!value) return null;
  return String(value._id || value.id || value.unit_id || value.unitId || value || '').trim() || null;
};

const getUnitCapacity = (unit) => {
  const capacity = Number(unit?.capacity);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULT_CAPACITY;
};

const getRotationDuration = (intern) => {
  const duration = Number(
    intern?.currentUnit?.duration
    || intern?.currentUnit?.duration_days
    || intern?.currentUnit?.durationDays
    || intern?.dashboard?.progress?.split?.('/')?.[1]
    || DEFAULT_DURATION_DAYS
  );
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION_DAYS;
};

const getCurrentUnitStartDate = (intern) => (
  toDate(intern?.currentUnit?.startDate)
  || toDate(intern?.currentUnit?.start_date)
  || null
);

const getCurrentUnitEndDate = (intern) => {
  const explicitEnd = toDate(intern?.currentUnit?.endDate) || toDate(intern?.currentUnit?.end_date);
  if (explicitEnd) return explicitEnd;

  const start = getCurrentUnitStartDate(intern);
  if (!start) return null;

  const duration = getRotationDuration(intern);
  return addDays(start, duration - 1);
};

const getCompletedUnitSet = (intern) => {
  const set = new Set();
  const completedUnits = Array.isArray(intern?.completedUnits) ? intern.completedUnits : [];

  completedUnits.forEach((entry) => {
    const id = getId(entry?.unit) || getId(entry?.unitId) || getId(entry?.unit_id);
    if (id) set.add(id);
  });

  const completedRotations = Array.isArray(intern?.rotations)
    ? intern.rotations.filter((rotation) => rotation?.status === 'completed')
    : [];

  completedRotations.forEach((rotation) => {
    const id = getId(rotation?.unit) || getId(rotation?.unitId) || getId(rotation?.unit_id);
    if (id) set.add(id);
  });

  return set;
};

const getCurrentUnitId = (intern) => (
  getId(intern?.currentUnit)
  || getId(intern?.dashboard?.currentUnitId)
  || null
);

const getRemainingDays = (intern, referenceDate = new Date()) => {
  const today = normalizeDate(referenceDate);
  const endDate = getCurrentUnitEndDate(intern);
  if (!endDate || Number.isNaN(today.getTime())) return null;
  return Math.floor((endDate.getTime() - today.getTime()) / DAY_IN_MS);
};

const buildLoadMaps = (interns, units, referenceDate = new Date(), leavingSoonDays = 5) => {
  const today = normalizeDate(referenceDate);
  const currentInternsMap = new Map();
  const leavingSoonMap = new Map();

  (units || []).forEach((unit) => {
    const unitId = getId(unit);
    if (!unitId) return;
    currentInternsMap.set(unitId, 0);
    leavingSoonMap.set(unitId, 0);
  });

  (interns || []).forEach((intern) => {
    const unitId = getCurrentUnitId(intern);
    if (!unitId) return;

    currentInternsMap.set(unitId, (currentInternsMap.get(unitId) || 0) + 1);

    const endDate = getCurrentUnitEndDate(intern);
    if (!endDate) return;

    const remainingDays = Math.floor((endDate.getTime() - today.getTime()) / DAY_IN_MS);
    if (remainingDays >= 0 && remainingDays <= leavingSoonDays) {
      leavingSoonMap.set(unitId, (leavingSoonMap.get(unitId) || 0) + 1);
    }
  });

  return { currentInternsMap, leavingSoonMap };
};

const hashSeed = (value) => {
  const str = String(value || 'seed');
  let hash = 0;
  for (let index = 0; index < str.length; index += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickCandidate = (candidates, seed) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const randomIndex = hashSeed(seed) % candidates.length;
  return candidates[randomIndex];
};

export function previewNextUnitForIntern(intern, options = {}) {
  const {
    interns = [],
    units = [],
    referenceDate = new Date(),
    leavingSoonDays = 5,
  } = options;

  const today = normalizeDate(referenceDate);
  const allUnits = Array.isArray(units) ? units : [];
  const currentUnitId = getCurrentUnitId(intern);
  const currentUnitEndDate = getCurrentUnitEndDate(intern);
  const remainingDays = getRemainingDays(intern, today);

  if (!currentUnitId || !currentUnitEndDate) {
    return {
      status: 'pending',
      reason: 'Pending Assignment',
      unit: null,
      startsOn: null,
      remainingDays,
      shouldPreview: false,
    };
  }

  const completedUnitSet = getCompletedUnitSet(intern);
  const allUnitIds = allUnits.map((unit) => getId(unit)).filter(Boolean);
  const completedAllUnits = allUnitIds.length > 0 && allUnitIds.every((unitId) => completedUnitSet.has(unitId));

  if (completedAllUnits) {
    return {
      status: 'rotation-complete',
      reason: 'Rotation Complete',
      unit: null,
      startsOn: null,
      remainingDays,
      shouldPreview: false,
    };
  }

  const { currentInternsMap, leavingSoonMap } = buildLoadMaps(interns, allUnits, today, leavingSoonDays);

  const metrics = allUnits
    .map((unit) => {
      const unitId = getId(unit);
      if (!unitId || unitId === currentUnitId) return null;

      const currentInterns = currentInternsMap.get(unitId) || 0;
      const internsLeavingSoon = leavingSoonMap.get(unitId) || 0;
      const effectiveLoad = Math.max(0, currentInterns - internsLeavingSoon);

      return {
        unit,
        unitId,
        currentInterns,
        internsLeavingSoon,
        effectiveLoad,
        capacity: getUnitCapacity(unit),
      };
    })
    .filter(Boolean);

  let eligible = metrics.filter((metric) => {
    if (completedUnitSet.has(metric.unitId)) return false;
    return metric.effectiveLoad < metric.capacity;
  });

  if (eligible.length === 0) {
    eligible = metrics;
  }

  if (eligible.length === 0) {
    return {
      status: 'pending',
      reason: 'Pending Assignment',
      unit: null,
      startsOn: null,
      remainingDays,
      shouldPreview: remainingDays !== null && remainingDays <= leavingSoonDays,
    };
  }

  eligible.sort((left, right) => left.effectiveLoad - right.effectiveLoad);
  const lowestLoad = eligible[0].effectiveLoad;
  const candidates = eligible.filter((metric) => metric.effectiveLoad === lowestLoad);
  const picked = pickCandidate(candidates, `${intern?.id || intern?._id || intern?.name}-${today.toISOString()}`);
  const startsOn = addDays(currentUnitEndDate, 1);

  return {
    status: 'preview',
    reason: null,
    unit: picked?.unit || null,
    startsOn,
    startsOnLabel: startsOn ? formatDate(startsOn) : null,
    remainingDays,
    shouldPreview: remainingDays !== null && remainingDays <= leavingSoonDays,
    metrics: picked || null,
  };
}

export function buildUpcomingMovements(interns, units, options = {}) {
  const {
    referenceDate = new Date(),
    movementWindowDays = 7,
    leavingSoonDays = 5,
  } = options;

  const today = normalizeDate(referenceDate);
  const movementRows = [];

  (interns || []).forEach((intern) => {
    const currentUnitId = getCurrentUnitId(intern);
    if (!currentUnitId) return;

    const currentEnd = getCurrentUnitEndDate(intern);
    if (!currentEnd) return;

    const remainingDays = Math.floor((currentEnd.getTime() - today.getTime()) / DAY_IN_MS);
    if (remainingDays < 0 || remainingDays > movementWindowDays) return;

    const preview = previewNextUnitForIntern(intern, {
      interns,
      units,
      referenceDate: today,
      leavingSoonDays,
    });

    movementRows.push({
      internId: intern?.id || intern?._id || null,
      internName: intern?.name || 'Unnamed Intern',
      fromUnit: intern?.currentUnit?.name || 'Unassigned',
      toUnit: preview?.unit?.name || preview?.reason || 'Pending Assignment',
      moveDate: addDays(currentEnd, 1),
      moveDateLabel: formatDate(addDays(currentEnd, 1)),
    });
  });

  return movementRows.sort((left, right) => {
    const leftTime = left.moveDate ? left.moveDate.getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.moveDate ? right.moveDate.getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

export function getInternUnitTiming(internLike, referenceDate = new Date()) {
  const today = normalizeDate(referenceDate);
  const startDate = toDate(internLike?.start_date || internLike?.startDate);
  const endDate = toDate(internLike?.end_date || internLike?.endDate);

  if (!startDate || !endDate) {
    return {
      elapsedDays: 0,
      totalDays: 0,
      remainingDays: null,
      progressLabel: 'Not started',
      endsOnLabel: 'Not set',
      leavingSoon: false,
    };
  }

  const totalDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / DAY_IN_MS) + 1);
  const elapsedRaw = Math.floor((today.getTime() - startDate.getTime()) / DAY_IN_MS) + 1;
  const elapsedDays = Math.max(0, Math.min(totalDays, elapsedRaw));
  const remainingDays = Math.floor((endDate.getTime() - today.getTime()) / DAY_IN_MS);

  return {
    elapsedDays,
    totalDays,
    remainingDays,
    progressLabel: `${elapsedDays} / ${totalDays} days`,
    endsOnLabel: formatDate(endDate),
    leavingSoon: remainingDays >= 0 && remainingDays <= 5,
  };
}
