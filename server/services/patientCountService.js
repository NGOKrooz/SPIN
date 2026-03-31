const mongoose = require('mongoose');

const Patient = require('../models/Patient');
const Unit = require('../models/Unit');
const { calculateWorkload } = require('./unitService');

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

  const rows = await Patient.aggregate([
    { $match: match },
    { $group: { _id: '$unit', patientCount: { $sum: 1 } } },
  ]);

  const countMap = new Map(normalizedUnitIds.map((unitId) => [unitId, 0]));
  for (const row of rows) {
    countMap.set(String(row._id), Number(row.patientCount || 0));
  }

  return countMap;
}

async function syncUnitPatientCounts(unitsOrUnitIds = []) {
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
    const patientCount = Number(countMap.get(unitId) || 0);
    const workload = calculateWorkload({ patientCount, capacity: unit.capacity });

    if (Number(unit.patientCount || 0) !== patientCount || String(unit.workload || '') !== workload) {
      operations.push({
        updateOne: {
          filter: { _id: unit._id },
          update: {
            $set: {
              patientCount,
              workload,
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