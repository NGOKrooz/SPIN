const mongoose = require('mongoose');

const Patient = require('../models/Patient');
const Unit = require('../models/Unit');

function normalizeUnitIds(unitIds = []) {
  return [...new Set((Array.isArray(unitIds) ? unitIds : [unitIds])
    .filter(Boolean)
    .map((unitId) => {
      if (unitId instanceof mongoose.Types.ObjectId) {
        return unitId.toString();
      }
      if (unitId?._id) {
        return unitId._id.toString();
      }
      return String(unitId);
    }))];
}

async function getActivePatientCountMap(unitIds = []) {
  const normalizedUnitIds = normalizeUnitIds(unitIds);
  const match = {
    active: true,
    unit: { $ne: null },
  };

  if (normalizedUnitIds.length > 0) {
    match.unit = {
      $in: normalizedUnitIds.map((unitId) => new mongoose.Types.ObjectId(unitId)),
    };
  }

  const patientBackedUnitIds = normalizedUnitIds.length > 0
    ? await Patient.distinct('unit', {
      unit: {
        $in: normalizedUnitIds.map((unitId) => new mongoose.Types.ObjectId(unitId)),
      },
    })
    : await Patient.distinct('unit', { unit: { $ne: null } });

  const rows = await Patient.aggregate([
    { $match: match },
    { $group: { _id: '$unit', patientCount: { $sum: 1 } } },
  ]);

  const countMap = new Map(
    patientBackedUnitIds
      .filter(Boolean)
      .map((unitId) => [String(unitId), 0])
  );
  for (const row of rows) {
    countMap.set(String(row._id), Number(row.patientCount || 0));
  }

  return countMap;
}

async function syncUnitPatientCounts(unitsOrUnitIds = [], options = {}) {
  const { forceZeroForRequestedIds = false } = options;
  const asArray = Array.isArray(unitsOrUnitIds) ? unitsOrUnitIds : [unitsOrUnitIds];
  const providedUnits = asArray.filter((item) => item && typeof item === 'object' && item._id);

  const units = providedUnits.length === asArray.length && asArray.length > 0
    ? providedUnits
    : await Unit.find(
      normalizeUnitIds(asArray).length > 0
        ? { _id: { $in: normalizeUnitIds(asArray) } }
        : {}
    ).exec();

  if (units.length === 0) {
    return new Map();
  }

  const countMap = await getActivePatientCountMap(units.map((unit) => unit._id));
  const operations = [];

  for (const unit of units) {
    const unitId = unit._id.toString();
    const hasAggregatedCount = countMap.has(unitId);
    const patientCount = hasAggregatedCount
      ? Number(countMap.get(unitId) || 0)
      : forceZeroForRequestedIds
        ? 0
      : Number(unit.patientCount ?? 0);

    if (Number(unit.patientCount ?? 0) !== patientCount) {
      operations.push({
        updateOne: {
          filter: { _id: unit._id },
          update: {
            $set: {
              patientCount,
              updatedAt: new Date(),
            },
          },
        },
      });
    }
  }

  if (operations.length > 0) {
    await Unit.bulkWrite(operations);
  }

  return countMap;
}

module.exports = {
  getActivePatientCountMap,
  normalizeUnitIds,
  syncUnitPatientCounts,
};