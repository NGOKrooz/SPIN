'use strict';

const mongoose = require('mongoose');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

const hasLegacyMarker = (rotation) => Boolean(
  rotation?.legacy
  || rotation?.isLegacy
  || rotation?.is_temp
  || rotation?.temp
  || rotation?.isTemporary
  || rotation?.type === 'legacy'
);

const buildRotationKey = (rotation) => {
  const unitId = rotation.unit ? String(rotation.unit) : 'null';
  const startDate = rotation.startDate ? new Date(rotation.startDate).toISOString() : 'null';
  const endDate = rotation.endDate ? new Date(rotation.endDate).toISOString() : 'null';
  const duration = rotation.duration != null ? String(rotation.duration) : 'null';
  return `${unitId}:${startDate}:${endDate}:${duration}`;
};

const isValidUnitReference = async (unitId) => {
  if (!unitId) return false;
  if (!mongoose.Types.ObjectId.isValid(String(unitId))) return false;
  return Boolean(await Unit.exists({ _id: unitId }));
};

const hasValidDates = (rotation) => {
  if (!rotation.startDate || !rotation.endDate) return false;
  const start = new Date(rotation.startDate);
  const end = new Date(rotation.endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
};

async function cleanupInvalidUpcomingRotations(internId, source = 'unknown') {
  const upcomingRotations = await Rotation.find({ intern: internId, status: 'upcoming' })
    .sort({ startDate: 1, createdAt: 1 })
    .exec();

  if (!upcomingRotations.length) {
    return { deleted: 0, deletedRotationIds: [] };
  }

  const seenKeys = new Set();
  const deleteRotationIds = [];

  for (const rotation of upcomingRotations) {
    const rotationId = rotation._id?.toString?.() || null;
    const unitId = rotation.unit ? String(rotation.unit) : null;
    const reasons = [];

    if (!await isValidUnitReference(unitId)) {
      reasons.push('invalid_unit_reference');
    }

    if (!hasValidDates(rotation)) {
      reasons.push('invalid_dates');
    }

    if (hasLegacyMarker(rotation)) {
      reasons.push('legacy_marker');
    }

    const key = buildRotationKey(rotation);
    if (seenKeys.has(key)) {
      reasons.push('duplicate_upcoming');
    }

    if (!reasons.length) {
      seenKeys.add(key);
      continue;
    }

    const logEntry = {
      intern: internId?.toString?.() || internId,
      rotationId,
      unit: unitId,
      reasonForDeletion: reasons.join('; '),
      source,
    };

    console.warn(JSON.stringify(logEntry));
    deleteRotationIds.push(rotation._id);
  }

  if (deleteRotationIds.length > 0) {
    await Rotation.deleteMany({ _id: { $in: deleteRotationIds } }).exec();
  }

  return {
    deleted: deleteRotationIds.length,
    deletedRotationIds: deleteRotationIds.map((id) => id.toString()),
  };
}

module.exports = {
  cleanupInvalidUpcomingRotations,
};
