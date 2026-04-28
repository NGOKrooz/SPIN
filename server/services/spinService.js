const SpinRecord = require('../models/SpinRecord');

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?._id?.toString) return value._id.toString();
  if (value?.id?.toString) return value.id.toString();
  if (value?.toString) return value.toString();
  return null;
};

const toName = (value, fallback = 'Unknown') => {
  if (!value) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value?.name === 'string') return value.name.trim() || fallback;
  return fallback;
};

function normalizeSpin(item) {
  const intern = item?.intern;
  const unit = item?.unit;
  const nextUnit = item?.next_unit;

  return {
    id: item?._id?.toString?.() || null,
    intern: intern ? {
      id: toId(intern),
      name: toName(intern),
    } : null,
    unit: unit ? {
      id: toId(unit),
      name: toName(unit),
    } : null,
    rotationId: toId(item?.rotation),
    nextUnit: nextUnit ? {
      id: toId(nextUnit),
      name: toName(nextUnit),
    } : null,
    nextRotationId: toId(item?.next_rotation),
    description: item?.description || 'Rotation completed',
    metadata: item?.metadata || null,
    created_at: item?.created_at || item?.createdAt || null,
    createdAt: item?.created_at || item?.createdAt || null,
    timestamp: item?.created_at || item?.createdAt || null,
  };
}

async function getSpinHistory(limit = null) {
  const query = SpinRecord.find({})
    .populate('intern', 'name')
    .populate('unit', 'name')
    .populate('next_unit', 'name')
    .populate('rotation', 'startDate endDate')
    .sort({ created_at: -1, _id: -1 });

  if (limit && Number.isFinite(limit) && limit > 0) {
    query.limit(Math.min(limit, 1000));
  }

  const items = await query.exec();
  return items.map(normalizeSpin);
}

async function getSpinCount() {
  return SpinRecord.countDocuments().exec();
}

async function logSpinEvent({
  internId = null,
  internName = null,
  unitId = null,
  unitName = null,
  rotationId = null,
  nextUnitId = null,
  nextUnitName = null,
  nextRotationId = null,
  description = null,
  metadata = null,
  createdAt = new Date(),
}) {
  const resolvedDescription = description || 'Rotation completed';
  const record = await SpinRecord.create({
    intern: internId,
    unit: unitId,
    rotation: rotationId,
    next_unit: nextUnitId,
    next_rotation: nextRotationId,
    description: resolvedDescription,
    metadata,
    created_at: createdAt,
    createdAt,
  });

  return normalizeSpin(record);
}

async function logSpinEventSafe(event) {
  try {
    return await logSpinEvent(event);
  } catch (err) {
    console.error('[SpinService] Failed to log spin event:', err);
    return null;
  }
}

module.exports = {
  getSpinHistory,
  getSpinCount,
  logSpinEvent,
  logSpinEventSafe,
};
