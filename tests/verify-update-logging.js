'use strict';

require('../server/node_modules/dotenv').config();

const mongoose = require('../server/node_modules/mongoose');
const Unit = require('../server/models/Unit');
const Intern = require('../server/models/Intern');
const ActivityLog = require('../server/models/ActivityLog');

const API_BASE = 'http://localhost:5000/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requestJson = async (url, options = {}) => {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  }

  return body;
};

const getLatestByType = async (type) => ActivityLog.findOne({ type }).sort({ createdAt: -1, _id: -1 }).lean();

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { retryWrites: true, w: 'majority' });

  const unit = await Unit.findOne({}).sort({ createdAt: 1 }).lean();
  const intern = await Intern.findOne({}).sort({ createdAt: 1 }).lean();
  assert(unit, 'No unit found for test');
  assert(intern, 'No intern found for test');

  const originalUnit = {
    name: unit.name,
    durationDays: Number(unit.durationDays || 20),
    capacity: Number(unit.capacity || 0),
    patientCount: Number(unit.patientCount || 0),
    description: unit.description || '',
    order: Number(unit.order || 1),
  };
  const originalIntern = {
    name: intern.name,
    gender: intern.gender,
    batch: intern.batch,
    startDate: new Date(intern.startDate).toISOString().slice(0, 10),
    phone: intern.phone || '',
    status: intern.status || 'active',
    extensionDays: Number(intern.extensionDays || 0),
    totalExtensionDays: Number(intern.totalExtensionDays || 0),
  };

  const beforeNoopCount = await ActivityLog.countDocuments({ type: 'unit_update' });

  const updatedUnitName = `${originalUnit.name} TMP`;
  const updatedDuration = originalUnit.durationDays + 1;

  await requestJson(`/units/${unit._id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: updatedUnitName,
      durationDays: updatedDuration,
      capacity: originalUnit.capacity,
      patientCount: originalUnit.patientCount,
      description: originalUnit.description,
    }),
  });

  const unitLog = await getLatestByType('unit_update');
  assert(unitLog, 'No unit_update log created');
  assert(unitLog.message === `${originalUnit.name} was updated: name changed to ${updatedUnitName}, duration changed from ${originalUnit.durationDays} days to ${updatedDuration} days`, 'Unit multi-change message format is incorrect');
  assert(Array.isArray(unitLog.metadata?.changes) && unitLog.metadata.changes.length >= 1, 'Unit log metadata.changes missing');
  assert(unitLog.entityId === String(unit._id), 'Unit log entityId missing or incorrect');
  const unitNameChange = unitLog.metadata.changes.find((change) => change.field === 'name');
  const unitDurationChange = unitLog.metadata.changes.find((change) => change.field === 'durationDays');
  assert(unitNameChange?.oldDisplayValue === originalUnit.name && unitNameChange?.newDisplayValue === updatedUnitName, 'Unit name change display values are incorrect');
  assert(unitDurationChange?.oldDisplayValue === `${originalUnit.durationDays} days` && unitDurationChange?.newDisplayValue === `${updatedDuration} days`, 'Unit duration change display values are incorrect');

  const unitNoopPayload = {
    name: updatedUnitName,
    durationDays: updatedDuration,
    capacity: originalUnit.capacity,
    patientCount: originalUnit.patientCount,
    description: originalUnit.description,
  };

  const beforeNoopUpdatedAt = unitLog.createdAt?.toISOString?.() || String(unitLog.createdAt);

  await requestJson(`/units/${unit._id}`, {
    method: 'PUT',
    body: JSON.stringify(unitNoopPayload),
  });

  const afterNoopCount = await ActivityLog.countDocuments({ type: 'unit_update' });
  assert(afterNoopCount === beforeNoopCount + 1, 'No-op unit update unexpectedly created an additional unit_update log');

  const updatedInternName = `${originalIntern.name} TMP`;
  const updatedBatch = originalIntern.batch === 'A' ? 'B' : 'A';
  const beforeInternUpdateCount = await ActivityLog.countDocuments({ type: 'intern_update' });

  await requestJson(`/interns/${intern._id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...originalIntern,
      name: updatedInternName,
      batch: updatedBatch,
    }),
  });

  const internLog = await getLatestByType('intern_update');
  assert(internLog, 'No intern_update log created');
  assert(internLog.message === `${originalIntern.name} was updated: name changed to ${updatedInternName}, batch changed from Batch ${originalIntern.batch} to Batch ${updatedBatch}`, 'Intern multi-change message format is incorrect');
  assert(Array.isArray(internLog.metadata?.changes) && internLog.metadata.changes.length >= 1, 'Intern log metadata.changes missing');
  assert(internLog.entityId === String(intern._id), 'Intern log entityId missing or incorrect');
  const internNameChange = internLog.metadata.changes.find((change) => change.field === 'name');
  const internBatchChange = internLog.metadata.changes.find((change) => change.field === 'batch');
  assert(internNameChange?.oldDisplayValue === originalIntern.name && internNameChange?.newDisplayValue === updatedInternName, 'Intern name change display values are incorrect');
  assert(internBatchChange?.oldDisplayValue === `Batch ${originalIntern.batch}` && internBatchChange?.newDisplayValue === `Batch ${updatedBatch}`, 'Intern batch change display values are incorrect');

  const afterInternUpdateCount = await ActivityLog.countDocuments({ type: 'intern_update' });
  assert(afterInternUpdateCount === beforeInternUpdateCount + 1, 'Intern update did not create exactly one intern_update log');

  await requestJson(`/interns/${intern._id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...originalIntern,
      name: updatedInternName,
      batch: updatedBatch,
    }),
  });

  const afterInternNoopCount = await ActivityLog.countDocuments({ type: 'intern_update' });
  assert(afterInternNoopCount === afterInternUpdateCount, 'No-op intern update unexpectedly created an intern_update log');

  await requestJson(`/units/${unit._id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: originalUnit.name,
      durationDays: originalUnit.durationDays,
      capacity: originalUnit.capacity,
      patientCount: originalUnit.patientCount,
      description: originalUnit.description,
    }),
  });

  await requestJson(`/interns/${intern._id}`, {
    method: 'PUT',
    body: JSON.stringify(originalIntern),
  });

  console.log(JSON.stringify({
    success: true,
    unitMessage: unitLog.message,
    internMessage: internLog.message,
    unitChanges: unitLog.metadata?.changes || [],
    internChanges: internLog.metadata?.changes || [],
    noopUnitDidNotCreateLog: true,
    noopInternDidNotCreateLog: true,
  }, null, 2));

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
