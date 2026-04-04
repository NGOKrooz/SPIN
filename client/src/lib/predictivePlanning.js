import { formatDate, normalizeDate } from './utils';

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const DEFAULT_DURATION_DAYS = 20;
export const PREDICTIVE_WINDOW_DAYS = 5;

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

const getRotationDuration = (intern) => {
  const duration = Number(
    intern?.currentUnit?.duration
    || intern?.currentUnit?.duration_days
    || intern?.currentUnit?.durationDays
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
  return addDays(start, getRotationDuration(intern) - 1);
};

const getCurrentUnitId = (intern) => getId(intern?.currentUnit) || getId(intern?.dashboard?.currentUnitId) || null;

const getRemainingDays = (intern, referenceDate = new Date()) => {
  const today = normalizeDate(referenceDate);
  const endDate = getCurrentUnitEndDate(intern);
  if (!endDate || Number.isNaN(today.getTime())) return null;
  return Math.floor((endDate.getTime() - today.getTime()) / DAY_IN_MS);
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

const buildUnitState = (interns, units, today, { leavingSoonDays = 5, recentIncomingDays = 7 } = {}) => {
  const state = new Map();
  for (const unit of units || []) {
    const unitId = getId(unit);
    if (!unitId) continue;
    state.set(unitId, {
      unit,
      unitId,
      currentInterns: 0,
      leavingSoon: 0,
      recentIncoming: 0,
      incomingBatch: 0,
      trueLoad: 0,
    });
  }

  for (const intern of interns || []) {
    const unitId = getCurrentUnitId(intern);
    if (!unitId || !state.has(unitId)) continue;

    const row = state.get(unitId);
    row.currentInterns += 1;

    const endDate = getCurrentUnitEndDate(intern);
    if (endDate) {
      const remaining = Math.floor((endDate.getTime() - today.getTime()) / DAY_IN_MS);
      if (remaining >= 0 && remaining <= leavingSoonDays) {
        row.leavingSoon += 1;
      }
    }

    const startDate = getCurrentUnitStartDate(intern);
    if (startDate) {
      const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / DAY_IN_MS);
      if (daysSinceStart >= 0 && daysSinceStart <= recentIncomingDays) {
        row.recentIncoming += 1;
      }
    }
  }

  for (const row of state.values()) {
    row.trueLoad = row.currentInterns - row.leavingSoon + row.incomingBatch + row.recentIncoming;
  }

  return state;
};

const recalcTrueLoad = (state, unitId) => {
  const row = state.get(unitId);
  if (!row) return;
  row.trueLoad = row.currentInterns - row.leavingSoon + row.incomingBatch + row.recentIncoming;
};

export function buildBalancedBatchAssignments(interns, units, options = {}) {
  const {
    referenceDate = new Date(),
    movementWindowDays = PREDICTIVE_WINDOW_DAYS,
    leavingSoonDays = PREDICTIVE_WINDOW_DAYS,
    recentIncomingDays = 7,
  } = options;

  const today = normalizeDate(referenceDate);
  const unitState = buildUnitState(interns, units, today, { leavingSoonDays, recentIncomingDays });

  const movingInterns = (interns || [])
    .map((intern) => {
      const currentUnitId = getCurrentUnitId(intern);
      const currentEndDate = getCurrentUnitEndDate(intern);
      if (!currentUnitId || !currentEndDate) return null;
      const remainingDays = Math.floor((currentEndDate.getTime() - today.getTime()) / DAY_IN_MS);
      if (remainingDays < 0 || remainingDays > movementWindowDays) return null;
      return {
        intern,
        internId: intern?.id || intern?._id || null,
        currentUnitId,
        currentEndDate,
        remainingDays,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.currentEndDate.getTime() - right.currentEndDate.getTime());

  const assignments = [];

  for (const item of movingInterns) {
    const completed = getCompletedUnitSet(item.intern);
    const unitRows = [...unitState.values()];
    const allUnitIds = unitRows.map((row) => row.unitId);

    let eligible = unitRows.filter((row) => row.unitId !== item.currentUnitId && !completed.has(row.unitId));

    if (eligible.length === 0 && allUnitIds.length > 0 && allUnitIds.every((unitId) => completed.has(unitId))) {
      eligible = unitRows.filter((row) => row.unitId !== item.currentUnitId);
    }

    if (eligible.length === 0) {
      eligible = unitRows.filter((row) => row.unitId !== item.currentUnitId);
    }

    if (eligible.length === 0) {
      eligible = unitRows;
    }

    if (eligible.length === 0) continue;

    eligible.sort((left, right) => left.trueLoad - right.trueLoad);
    const lowest = eligible[0].trueLoad;
    const candidates = eligible.filter((row) => row.trueLoad === lowest);
    const selected = pickCandidate(candidates, `${item.internId || item.intern?.name}-${today.toISOString()}`);

    if (!selected) continue;

    selected.incomingBatch += 1;
    recalcTrueLoad(unitState, selected.unitId);

    assignments.push({
      intern: item.intern,
      internId: item.internId,
      fromUnitId: item.currentUnitId,
      fromUnitName: item.intern?.currentUnit?.name || 'Unassigned',
      toUnitId: selected.unitId,
      toUnitName: selected.unit?.name || 'Pending Assignment',
      moveDate: addDays(item.currentEndDate, 1),
      remainingDays: item.remainingDays,
    });
  }

  return {
    assignments,
    unitState: [...unitState.values()].sort((left, right) => left.trueLoad - right.trueLoad),
  };
}

export function previewNextUnitForIntern(intern, options = {}) {
  const {
    interns = [],
    units = [],
    referenceDate = new Date(),
    leavingSoonDays = PREDICTIVE_WINDOW_DAYS,
  } = options;

  const today = normalizeDate(referenceDate);
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

  const { assignments } = buildBalancedBatchAssignments(interns, units, {
    referenceDate: today,
    movementWindowDays: leavingSoonDays,
    leavingSoonDays,
    recentIncomingDays: 7,
  });

  const internId = intern?.id || intern?._id || null;
  const hit = assignments.find((row) => String(row.internId) === String(internId));

  if (!hit) {
    return {
      status: 'pending',
      reason: 'Pending Assignment',
      unit: null,
      startsOn: null,
      remainingDays,
      shouldPreview: remainingDays !== null && remainingDays <= leavingSoonDays,
    };
  }

  const unit = (units || []).find((u) => getId(u) === String(hit.toUnitId)) || { id: hit.toUnitId, name: hit.toUnitName };

  return {
    status: 'preview',
    reason: null,
    unit,
    startsOn: hit.moveDate,
    startsOnLabel: hit.moveDate ? formatDate(hit.moveDate) : null,
    remainingDays,
    shouldPreview: remainingDays !== null && remainingDays <= leavingSoonDays,
  };
}

export function buildUpcomingMovements(interns, units, options = {}) {
  const {
    referenceDate = new Date(),
    movementWindowDays = PREDICTIVE_WINDOW_DAYS,
    leavingSoonDays = PREDICTIVE_WINDOW_DAYS,
  } = options;

  const { assignments } = buildBalancedBatchAssignments(interns, units, {
    referenceDate,
    movementWindowDays,
    leavingSoonDays,
    recentIncomingDays: 7,
  });

  return assignments
    .map((movement) => ({
      internId: movement.internId,
      internName: movement.intern?.name || 'Unnamed Intern',
      fromUnit: movement.fromUnitName,
      toUnit: movement.toUnitName,
      moveDate: movement.moveDate,
      moveDateLabel: movement.moveDate ? formatDate(movement.moveDate) : 'TBD',
    }))
    .sort((left, right) => {
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
    leavingSoon: remainingDays >= 0 && remainingDays <= PREDICTIVE_WINDOW_DAYS,
  };
}
