const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

const DAY_IN_MS = 1000 * 60 * 60 * 24;

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

const getRotationBaseDuration = (rotation, fallbackUnit = null) => {
  const rawBaseDuration = Number(rotation?.baseDuration);
  if (Number.isFinite(rawBaseDuration) && rawBaseDuration > 0) {
    return rawBaseDuration;
  }

  const rawFallbackDuration = Number(
    fallbackUnit?.durationDays ?? fallbackUnit?.duration ?? fallbackUnit?.duration_days
  );
  return Number.isFinite(rawFallbackDuration) && rawFallbackDuration > 0 ? rawFallbackDuration : 20;
};

const getRotationExtensionDays = (rotation, fallbackUnit = null) => {
  const rawExtensionDays = Number(rotation?.extensionDays);
  if (Number.isFinite(rawExtensionDays) && rawExtensionDays >= 0) {
    return rawExtensionDays;
  }

  const baseDuration = getRotationBaseDuration(rotation, fallbackUnit);
  const rawTotalDuration = Number(rotation?.duration);
  if (Number.isFinite(rawTotalDuration) && rawTotalDuration > 0 && Number.isFinite(baseDuration) && baseDuration > 0) {
    return Math.max(0, rawTotalDuration - baseDuration);
  }

  return 0;
};

const getRotationTotalDuration = (rotation, fallbackUnit = null) => {
  const rawTotalDuration = Number(rotation?.duration);
  if (Number.isFinite(rawTotalDuration) && rawTotalDuration > 0) {
    return rawTotalDuration;
  }

  return getRotationBaseDuration(rotation, fallbackUnit) + getRotationExtensionDays(rotation, fallbackUnit);
};

// Helper functions for status computation
const computePrimaryStatus = (rotations = []) => {
  const hasActive = rotations.some(r => r.status === 'active');
  const hasUpcoming = rotations.some(r => r.status === 'upcoming');
  return hasActive || hasUpcoming ? 'ACTIVE' : 'COMPLETED';
};

const computeExtensionStatus = (rotations = []) => {
  return rotations.some(r => Number(r.extensionDays || 0) > 0);
};

const computeTotalExtensionDays = (rotations = []) => {
  return rotations.reduce((sum, r) => sum + Number(r.extensionDays || 0), 0);
};

const computeExtensionByUnit = (rotations = []) => {
  const extensionMap = new Map();
  rotations.forEach(r => {
    const unitName = r.unitName || r.unit_name || 'Unknown Unit';
    const extensionDays = Number(r.extensionDays || 0);
    extensionMap.set(unitName, (extensionMap.get(unitName) || 0) + extensionDays);
  });
  return Array.from(extensionMap.entries()).map(([unit, days]) => ({ unit, extensionDays: days }));
};

// Helper functions (extracted from interns.js for reuse)
const toIsoString = (date) => {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch (_) {
    return null;
  }
};

const getRotationStatus = (rotation, today = new Date()) => {
  if (rotation?.status === 'active' || rotation?.status === 'upcoming' || rotation?.status === 'completed') {
    return rotation.status;
  }

  const startRaw = rotation.startDate || rotation.start_date;
  const endRaw = rotation.endDate || rotation.end_date;

  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;

  const hasValidStart = start instanceof Date && !Number.isNaN(start.getTime());
  const hasValidEnd = end instanceof Date && !Number.isNaN(end.getTime());

  if (!hasValidStart) return 'upcoming';

  if (!hasValidEnd) {
    return start <= today ? 'active' : 'upcoming';
  }

  if (start <= today && end >= today) return 'active';
  if (start > today) return 'upcoming';
  return 'completed';
};

const formatRotation = (rotation) => {
  const status = getRotationStatus(rotation);

  const unit = rotation.unitId || rotation.unit || rotation.unit_id || null;
  const unitId = unit?._id?.toString() || unit?.id || null;
  const unitName = unit?.name || (rotation.unit_name || null);

  const rotationBaseDuration = getRotationBaseDuration(rotation, rotation.unit);
  const rotationExtensionDays = getRotationExtensionDays(rotation, rotation.unit);
  const rotationDuration = getRotationTotalDuration(rotation, rotation.unit);

  return {
    id: rotation._id?.toString(),
    startDate: toIsoString(rotation.startDate || rotation.start_date),
    endDate: toIsoString(rotation.endDate || rotation.end_date),
    start_date: toIsoString(rotation.startDate || rotation.start_date),
    end_date: toIsoString(rotation.endDate || rotation.end_date),
    duration: rotationDuration,
    baseDuration: rotationBaseDuration,
    extensionDays: rotationExtensionDays,
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
      duration_days: unit.durationDays || unit.duration_days || null,
      duration: unit.duration || unit.durationDays || unit.duration_days || null,
      position: unit.position || unit.order || null,
      position_order: unit.position || unit.order || null,
    } : null,
  };
};

const formatIntern = (intern, rotations = []) => {
  const formattedRotations = (rotations || []).map(formatRotation);

  const currentRotation = formattedRotations.find(r => r.status === 'active');
  const upcomingRotations = formattedRotations.filter(r => r.status === 'upcoming');
  const completedRotations = formattedRotations.filter(r => r.status === 'completed');

  // Compute status fields
  const primaryStatus = computePrimaryStatus(formattedRotations);
  const hasExtension = computeExtensionStatus(formattedRotations);
  const totalExtensionDays = computeTotalExtensionDays(formattedRotations);
  const extensionByUnit = computeExtensionByUnit(formattedRotations);

  const startDate = intern.startDate || intern.start_date;

  const currentUnitDuration = Number(getRotationTotalDuration(currentRotation, currentRotation?.unit)) || null;
  const currentUnitStartDate = currentRotation?.startDate || currentRotation?.start_date || null;
  const currentUnitElapsedDays = calculateElapsedDays(currentUnitStartDate, currentUnitDuration);

  const currentUnit = currentRotation?.unit
    ? {
      ...currentRotation.unit,
      id: currentRotation.unit.id || currentRotation.unit._id || null,
      startDate: currentUnitStartDate,
      start_date: currentUnitStartDate,
      duration: currentUnitDuration,
      duration_days: currentUnitDuration,
      elapsedDays: currentUnitElapsedDays,
      elapsed_days: currentUnitElapsedDays,
    }
    : (intern.currentUnit ? {
      id: intern.currentUnit._id?.toString?.() || intern.currentUnit.toString(),
      name: intern.currentUnit.name || null,
      startDate: null,
      start_date: null,
      duration: null,
      duration_days: null,
      elapsedDays: 0,
      elapsed_days: 0,
    } : null);

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
    totalExtensionDays: intern.totalExtensionDays || intern.total_extension_days || 0,
    total_extension_days: intern.totalExtensionDays || intern.total_extension_days || 0,
    phone: intern.phone || intern.phone_number || '',
    phone_number: intern.phone || intern.phone_number || '',
    // New computed status fields
    primaryStatus,
    hasExtension,
    totalExtensionDays: totalExtensionDays,
    extensionByUnit,
    currentUnit,
    rotations: formattedRotations,
    upcomingUnits: upcomingRotations,
    completedUnits: completedRotations,
    createdAt: toIsoString(intern.createdAt),
    updatedAt: toIsoString(intern.updatedAt),
  };
};

const addUnitProgress = (internView, currentUnit, units = []) => {
  const activeRotation = (internView.rotations || []).find((rotation) => rotation.status === 'active') || null;
  const currentUnitId = (
    currentUnit?._id?.toString?.()
    || currentUnit?.id
    || activeRotation?.unitId
    || activeRotation?.unit_id
    || null
  );

  const completedUnitIds = new Set(
    (internView.completedUnits || [])
      .map((rotation) => rotation.unitId || rotation.unit_id || null)
      .filter(Boolean)
      .map((value) => String(value))
  );

  const unitById = new Map((units || []).map((unit) => {
    const unitId = unit?._id?.toString?.() || unit?.id?.toString?.() || null;
    return [unitId, unit];
  }).filter(([unitId]) => Boolean(unitId)));

  const upcomingRotations = [...(internView.upcomingUnits || [])]
    .sort((left, right) => {
      const leftTime = left?.startDate ? new Date(left.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right?.startDate ? new Date(right.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

  const seenUpcomingUnitIds = new Set();
  const remainingUnitDocs = [];

  for (const rotation of upcomingRotations) {
    const unitId = String(rotation.unitId || rotation.unit_id || '');
    if (!unitId || seenUpcomingUnitIds.has(unitId)) continue;

    const unitFromRotation = rotation.unit || null;
    const fallbackUnit = unitById.get(unitId) || null;
    const mergedUnit = {
      ...(fallbackUnit || {}),
      ...(unitFromRotation || {}),
      _id: fallbackUnit?._id || fallbackUnit?.id || unitFromRotation?._id || unitFromRotation?.id || unitId,
      name: unitFromRotation?.name || fallbackUnit?.name || rotation.unitName || rotation.unit_name || 'Unknown Unit',
      durationDays: unitFromRotation?.durationDays || unitFromRotation?.duration_days || fallbackUnit?.durationDays || fallbackUnit?.duration || fallbackUnit?.duration_days || null,
      duration: unitFromRotation?.duration || fallbackUnit?.duration || fallbackUnit?.durationDays || fallbackUnit?.duration_days || null,
      order: fallbackUnit?.order ?? fallbackUnit?.position ?? null,
    };

    remainingUnitDocs.push(mergedUnit);
    seenUpcomingUnitIds.add(unitId);
  }

  for (const unit of units || []) {
    const unitId = unit?._id?.toString?.() || unit?.id?.toString?.() || null;
    if (!unitId || seenUpcomingUnitIds.has(unitId)) continue;
    if (currentUnitId && String(currentUnitId) === unitId) continue;
    if (completedUnitIds.has(unitId)) continue;
    remainingUnitDocs.push(unit);
  }

  const upcomingUnitDoc = remainingUnitDocs[0] || null;

  const activeStartDate = activeRotation?.startDate ? new Date(activeRotation.startDate) : null;
  if (activeStartDate) activeStartDate.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Compute totalDays from actual rotation dates (includes any extension)
  const totalDays = (() => {
    const endDate = activeRotation?.endDate ? new Date(activeRotation.endDate) : null;
    if (activeStartDate && endDate) {
      endDate.setHours(0, 0, 0, 0);
      const diff = Math.round((endDate.getTime() - activeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) return diff;
    }
    // Fallback to rotation.duration (already includes extension)
    if (activeRotation?.duration) return Number(activeRotation.duration);
    return Number(
      activeRotation?.unit?.duration ||
      activeRotation?.unit?.durationDays ||
      activeRotation?.unit?.duration_days ||
      20
    );
  })();

  // day 1 starts on startDate, then increments daily and caps at totalDays
  const daysSpent = activeStartDate
    ? calculateElapsedDays(activeStartDate, totalDays, now)
    : 0;
  const currentUnitProgress = activeRotation ? `${daysSpent}/${totalDays}` : null;

  const nextUpcomingRotation = upcomingRotations[0] || null;
  const upcomingStartDate = nextUpcomingRotation?.startDate ? new Date(nextUpcomingRotation.startDate) : null;
  const upcomingEndDate = nextUpcomingRotation?.endDate ? new Date(nextUpcomingRotation.endDate) : null;

  const internshipStartDate = internView.startDate || internView.start_date || null;
  const internshipDays = calculateElapsedDays(internshipStartDate, null, now);

  return {
    ...internView,
    currentUnit: internView.currentUnit ? {
      ...internView.currentUnit,
      startDate: activeRotation?.startDate || activeRotation?.start_date || internView.currentUnit.startDate || null,
      start_date: activeRotation?.startDate || activeRotation?.start_date || internView.currentUnit.start_date || null,
      duration: totalDays || internView.currentUnit.duration || internView.currentUnit.duration_days || null,
      duration_days: totalDays || internView.currentUnit.duration_days || internView.currentUnit.duration || null,
      elapsedDays: daysSpent,
      elapsed_days: daysSpent,
    } : null,
    upcomingUnit: upcomingUnitDoc ? {
      id: upcomingUnitDoc._id.toString(),
      name: upcomingUnitDoc.name,
      order: upcomingUnitDoc.order ?? upcomingUnitDoc.position ?? null,
      duration: upcomingUnitDoc.durationDays ?? upcomingUnitDoc.duration ?? null,
      duration_days: upcomingUnitDoc.durationDays ?? upcomingUnitDoc.duration ?? null,
    } : null,
    remainingUnits: remainingUnitDocs.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      order: u.order ?? u.position ?? null,
      duration: u.durationDays ?? u.duration ?? null,
      duration_days: u.durationDays ?? u.duration ?? null,
    })),
    dashboard: {
      currentUnit: internView.currentUnit?.name || null,
      progress: currentUnitProgress,
      upcomingUnit: upcomingUnitDoc?.name || null,
      upcomingStart: upcomingStartDate ? upcomingStartDate.toISOString() : null,
      upcomingEnd: upcomingEndDate ? upcomingEndDate.toISOString() : null,
    },
    internshipDays,
  };
};

/**
 * Central data builder for intern views
 * Builds comprehensive intern data with rotations and unit information
 * @param {string} internId - The intern ID to build view for
 * @returns {Promise<Object>} Formatted intern data with rotations
 */
const buildInternView = async (internId) => {
  try {
    const intern = await Intern.findById(internId).populate('currentUnit').exec();
    if (!intern) {
      throw new Error('Intern not found');
    }

    const rotations = await Rotation.find({ intern: intern._id })
      .populate('unit')
      .sort({ startDate: 1 })
      .exec();

    const units = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
    return addUnitProgress(formatIntern(intern, rotations), intern.currentUnit, units);
  } catch (error) {
    console.error('Error building intern view:', error);
    throw error;
  }
};

/**
 * Build intern views for multiple interns
 * @param {Array<string>} internIds - Array of intern IDs
 * @returns {Promise<Array<Object>>} Array of formatted intern data
 */
const buildInternViews = async (internIds) => {
  try {
    const interns = await Intern.find({ _id: { $in: internIds } }).populate('currentUnit').exec();
    const units = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
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

    return interns.map((intern) => {
      const formatted = formatIntern(intern, rotationsByIntern[intern._id.toString()] || []);
      return addUnitProgress(formatted, intern.currentUnit, units);
    });
  } catch (error) {
    console.error('Error building intern views:', error);
    throw error;
  }
};

module.exports = {
  buildInternView,
  buildInternViews,
  formatIntern,
  formatRotation,
  getRotationStatus,
  getRotationBaseDuration,
  getRotationExtensionDays,
  getRotationTotalDuration,
  computePrimaryStatus,
  computeExtensionStatus,
  computeTotalExtensionDays,
  computeExtensionByUnit,
};