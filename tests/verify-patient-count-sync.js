'use strict';

require('../server/node_modules/dotenv').config();

const mongoose = require('../server/node_modules/mongoose');
const Unit = require('../server/models/Unit');
const Patient = require('../server/models/Patient');

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
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  }

  return body;
};

const getUnitRecord = async (unitId) => {
  const unit = await requestJson(`/units/${unitId}`);
  return Number(unit.patient_count ?? unit.patientCount ?? 0);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { retryWrites: true, w: 'majority' });

  const units = await Unit.find({}).sort({ order: 1, createdAt: 1 }).limit(2).lean();
  assert(units.length >= 2, 'At least two units are required for patient count verification');

  const [sourceUnit, targetUnit] = units;
  const createdPatientIds = [];

  try {
    const createPatient = async (name, unitId) => {
      const patient = await requestJson('/patients', {
        method: 'POST',
        body: JSON.stringify({ name, unitId }),
      });
      createdPatientIds.push(patient.id || patient._id);
      return patient;
    };

    const initialSourceCount = await getUnitRecord(sourceUnit._id);
    const initialTargetCount = await getUnitRecord(targetUnit._id);

    const patientOne = await createPatient(`Test Patient ${Date.now()} A`, sourceUnit._id);
    assert(await getUnitRecord(sourceUnit._id) === initialSourceCount + 1, 'Add patient should increase source unit count');

    await requestJson(`/patients/${patientOne.id || patientOne._id}`, { method: 'DELETE' });
    createdPatientIds.pop();
    assert(await getUnitRecord(sourceUnit._id) === initialSourceCount, 'Delete patient should decrease source unit count');

    const patientTwo = await createPatient(`Test Patient ${Date.now()} B`, sourceUnit._id);
    await requestJson(`/patients/${patientTwo.id || patientTwo._id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ unitId: targetUnit._id.toString() }),
    });
    assert(await getUnitRecord(sourceUnit._id) === initialSourceCount, 'Reassign patient should decrease source unit count');
    assert(await getUnitRecord(targetUnit._id) === initialTargetCount + 1, 'Reassign patient should increase target unit count');

    const patientThree = await createPatient(`Test Patient ${Date.now()} C`, targetUnit._id);
    const patientFour = await createPatient(`Test Patient ${Date.now()} D`, targetUnit._id);
    const patientFive = await createPatient(`Test Patient ${Date.now()} E`, targetUnit._id);

    const refreshedTargetCount = await getUnitRecord(targetUnit._id);
    assert(refreshedTargetCount === initialTargetCount + 4, 'Sequential patient creation should keep target count accurate');

    const dbCount = await Patient.countDocuments({ unit: targetUnit._id, active: true }).exec();
    assert(refreshedTargetCount === dbCount, 'Unit patient count should match database count after refresh');

    console.log(JSON.stringify({
      success: true,
      sourceUnit: sourceUnit.name,
      targetUnit: targetUnit.name,
      finalSourceCount: await getUnitRecord(sourceUnit._id),
      finalTargetCount: refreshedTargetCount,
      databaseTargetCount: dbCount,
      createdPatients: [patientTwo, patientThree, patientFour, patientFive].map((patient) => patient.name),
    }, null, 2));
  } finally {
    if (createdPatientIds.length > 0) {
      await Patient.deleteMany({ _id: { $in: createdPatientIds } }).exec();
    }
    await mongoose.disconnect();
  }
})().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});