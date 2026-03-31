const ActivityLog = require('../models/ActivityLog');

const ACTIVITY_TYPES = Object.freeze({
  INTERN_CREATED: 'intern_created',
  INTERN_UPDATE: 'intern_update',
  INTERN_DELETED: 'intern_deleted',
  INTERN_EXTENSION_ADDED: 'intern_extension_added',
  INTERN_EXTENSION_REMOVED: 'intern_extension_removed',
  INTERN_REASSIGNED: 'intern_reassigned',
  ROTATION_MOVED: 'rotation_moved',
  UNIT_CREATED: 'unit_created',
  UNIT_UPDATE: 'unit_update',
  UNIT_UPDATED: 'unit_updated',
  WORKLOAD_UPDATED: 'workload_updated',
  UNIT_DELETED: 'unit_deleted',
  ACTIVITY: 'activity',
});

function normalizeType(type) {
  return String(type || ACTIVITY_TYPES.ACTIVITY)
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?._id?.toString) return value._id.toString();
  if (value?.id?.toString) return value.id.toString();
  if (value?.toString) return value.toString();
  return null;
}

function toName(value, fallback = 'Unknown') {
  if (!value) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value?.name === 'string' && value.name.trim()) {
    return value.name.trim();
  }
  return fallback;
}

function formatDuration(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value ?? 'none');
  }

  if (numericValue % 7 === 0) {
    const weeks = numericValue / 7;
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }

  return `${numericValue} ${numericValue === 1 ? 'day' : 'days'}`;
}

function formatFieldLabel(field) {
  const labels = {
    name: 'Name',
    duration: 'Duration',
    durationDays: 'Duration',
    capacity: 'Capacity',
    patientCount: 'Patient count',
    description: 'Description',
    order: 'Order',
    position: 'Position',
    workload: 'Workload',
  };

  return labels[field] || String(field || 'Field')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase());
}

function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return 'none';
  }

  if (field === 'duration' || field === 'durationDays') {
    return formatDuration(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    if (typeof value.name === 'string' && value.name.trim()) {
      return value.name.trim();
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function buildActivityMessage(type, metadata = {}, fallbackMessage = null) {
  const internName = toName(metadata.internName || metadata.intern, 'An intern');
  const unitName = toName(metadata.unitName || metadata.unit, 'Unknown unit');
  const previousUnitName = toName(metadata.previousUnitName || metadata.previousUnit, 'Unknown unit');
  const nextUnitName = toName(metadata.nextUnitName || metadata.newUnitName || metadata.newUnit, 'Unknown unit');
  const field = metadata.field || metadata.fieldName;
  const oldValue = formatFieldValue(field, metadata.oldValue);
  const newValue = formatFieldValue(field, metadata.newValue);
  const absoluteDays = Math.abs(Number(metadata.days || 0));

  switch (normalizeType(type)) {
    case ACTIVITY_TYPES.INTERN_CREATED:
      return `${internName} was added as a new intern`;
    case ACTIVITY_TYPES.INTERN_DELETED:
      return `Deleted Intern: ${internName}`;
    case ACTIVITY_TYPES.INTERN_EXTENSION_ADDED:
      return `${internName} was extended by ${absoluteDays} ${absoluteDays === 1 ? 'day' : 'days'}`;
    case ACTIVITY_TYPES.INTERN_EXTENSION_REMOVED:
      return `${internName} extension was reduced by ${absoluteDays} ${absoluteDays === 1 ? 'day' : 'days'}`;
    case ACTIVITY_TYPES.INTERN_REASSIGNED:
      return `${internName} was reassigned from ${previousUnitName} to ${nextUnitName}`;
    case ACTIVITY_TYPES.ROTATION_MOVED:
      return `${internName} moved from ${previousUnitName} to ${nextUnitName}`;
    case ACTIVITY_TYPES.UNIT_CREATED:
      return `New unit created: ${unitName}`;
    case ACTIVITY_TYPES.UNIT_UPDATE:
      return metadata.message || `Unit ${unitName} was updated`;
    case ACTIVITY_TYPES.UNIT_UPDATED:
      return `Unit ${unitName} was updated: ${formatFieldLabel(field)} changed from ${oldValue} to ${newValue}`;
    case ACTIVITY_TYPES.WORKLOAD_UPDATED:
      return `Unit ${unitName} workload updated from ${oldValue} to ${newValue}`;
    case ACTIVITY_TYPES.UNIT_DELETED:
      return `Deleted unit: ${unitName}`;
    case ACTIVITY_TYPES.INTERN_UPDATE:
      return metadata.message || `${internName} was updated`;
    default:
      return fallbackMessage || metadata.message || 'Activity update';
  }
}

function normalizeActivity(item) {
  const metadata = item?.metadata || item?.details || null;
  const type = normalizeType(item?.type || item?.action);
  const createdAt = item?.createdAt || item?.timestamp || item?.created_at || null;
  const message = item?.message || buildActivityMessage(type, metadata);

  return {
    id: item?._id?.toString?.() || item?.id || null,
    type,
    action: type,
    message,
    description: message,
    metadata,
    createdAt,
    created_at: createdAt,
    intern: item?.intern || metadata?.internId || null,
  };
}

async function getRecentActivities(limit = 10) {
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 100)
    : 10;

  const items = await ActivityLog.find({})
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .exec();

  return items.map(normalizeActivity);
}

async function logActivityEvent({ type, metadata = {}, message = null, createdAt = new Date() }) {
  const normalizedType = normalizeType(type);
  const resolvedMetadata = metadata || {};
  const resolvedMessage = buildActivityMessage(normalizedType, resolvedMetadata, message);

  const activity = await ActivityLog.create({
    type: normalizedType,
    action: normalizedType,
    metadata: resolvedMetadata,
    details: resolvedMetadata,
    message: resolvedMessage,
    intern: resolvedMetadata?.internId || null,
    timestamp: createdAt,
    createdAt,
  });

  return activity;
}

async function logActivity(action, details = {}, internId = null) {
  const metadata = {
    ...(details || {}),
    internId: details?.internId || internId || null,
  };

  return logActivityEvent({
    type: action,
    metadata,
    message: details?.message || null,
  });
}

async function logActivitySafe(action, details = {}, internId = null) {
  try {
    return await logActivity(action, details, internId);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log activity ${action}:`, err);
    return null;
  }
}

async function logRecentUpdate(type, message, internId = null) {
  return logActivityEvent({
    type,
    metadata: { internId: internId || null, message },
    message,
  });
}

async function logRecentUpdateSafe(type, message, internId = null) {
  return logActivitySafe(type, { message }, internId);
}

async function logActivityEventSafe(event) {
  try {
    return await logActivityEvent(event);
  } catch (err) {
    console.error(`[RecentUpdates] Failed to log activity event ${event?.type}:`, err);
    return null;
  }
}

module.exports = {
  ACTIVITY_TYPES,
  buildActivityMessage,
  getRecentActivities,
  logActivity,
  logActivitySafe,
  logActivityEvent,
  logActivityEventSafe,
  logRecentUpdate,
  logRecentUpdateSafe,
  normalizeActivity,
};
