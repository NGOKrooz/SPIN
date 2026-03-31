const express = require('express');
const { body, validationResult } = require('express-validator');

const Patient = require('../models/Patient');
const Unit = require('../models/Unit');
const { syncUnitPatientCounts } = require('../services/patientCountService');
const { logActivityEventSafe } = require('../services/recentUpdatesService');
const { updateBatchStats } = require('./dashboard');

const router = express.Router();

const validatePatientPayload = [
  body('name').customSanitizer((value) => typeof value === 'string' ? value.trim() : value)
    .notEmpty().withMessage('Patient name is required')
    .bail()
    .isLength({ max: 100 }).withMessage('Patient name must be 1-100 characters'),
  body('unitId').notEmpty().withMessage('unitId is required'),
  body('active').optional().isBoolean().withMessage('active must be true or false'),
];

const parseBoolean = (value, fallback = undefined) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return Boolean(value);
};

const normalizePatientPayload = (req, res, next) => {
  if (req.body.unit_id !== undefined && req.body.unitId === undefined) {
    req.body.unitId = req.body.unit_id;
  }
  if (req.body.patient_name !== undefined && req.body.name === undefined) {
    req.body.name = req.body.patient_name;
  }
  next();
};

const formatPatient = (patient) => ({
  ...patient.toObject(),
  unitId: patient.unit?._id?.toString?.() || patient.unit?.toString?.() || null,
  unit_id: patient.unit?._id?.toString?.() || patient.unit?.toString?.() || null,
  unit_name: patient.unit?.name || null,
});

async function ensureUnitExists(unitId) {
  const unit = await Unit.findById(unitId).exec();
  if (!unit) {
    throw new Error('Unit not found');
  }
  return unit;
}

router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.unitId) query.unit = req.query.unitId;
    if (req.query.active === 'true') query.active = true;
    if (req.query.active === 'false') query.active = false;

    const patients = await Patient.find(query)
      .populate('unit', 'name')
      .sort({ createdAt: -1, name: 1 })
      .exec();

    res.json(patients.map(formatPatient));
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

router.post('/', normalizePatientPayload, validatePatientPayload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0]?.msg || 'Validation failed', errors: errors.array() });
  }

  try {
    const unit = await ensureUnitExists(req.body.unitId);
    const patient = await Patient.create({
      name: req.body.name.trim(),
      unit: unit._id,
      active: parseBoolean(req.body.active, true),
      notes: req.body.notes || '',
      admittedAt: req.body.admittedAt ? new Date(req.body.admittedAt) : new Date(),
    });

    await syncUnitPatientCounts([unit._id]);
    await logActivityEventSafe({
      type: 'patient_created',
      message: `${patient.name} was added to ${unit.name}`,
      metadata: {
        patientId: patient._id.toString(),
        patientName: patient.name,
        unitId: unit._id.toString(),
        unitName: unit.name,
      },
    });
    await updateBatchStats().catch(() => {});

    const populatedPatient = await Patient.findById(patient._id).populate('unit', 'name').exec();
    res.status(201).json(formatPatient(populatedPatient));
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(error.message === 'Unit not found' ? 404 : 500).json({ error: error.message || 'Failed to create patient' });
  }
});

router.put('/:id', normalizePatientPayload, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).exec();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const affectedUnitIds = [patient.unit].filter(Boolean);

    if (req.body.name !== undefined) {
      const normalizedName = String(req.body.name || '').trim();
      if (!normalizedName) {
        return res.status(400).json({ error: 'Patient name is required' });
      }
      patient.name = normalizedName;
    }

    if (req.body.unitId !== undefined && String(req.body.unitId) !== String(patient.unit)) {
      const nextUnit = await ensureUnitExists(req.body.unitId);
      patient.unit = nextUnit._id;
      affectedUnitIds.push(nextUnit._id);
    }

    if (req.body.active !== undefined) {
      patient.active = parseBoolean(req.body.active, patient.active);
    }

    if (req.body.notes !== undefined) {
      patient.notes = req.body.notes || '';
    }

    if (patient.active === false && !patient.dischargedAt) {
      patient.dischargedAt = new Date();
    }
    if (patient.active === true) {
      patient.dischargedAt = null;
    }

    await patient.save();
    await syncUnitPatientCounts(affectedUnitIds);
    await updateBatchStats().catch(() => {});

    const populatedPatient = await Patient.findById(patient._id).populate('unit', 'name').exec();
    res.json(formatPatient(populatedPatient));
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(error.message === 'Unit not found' ? 404 : 500).json({ error: error.message || 'Failed to update patient' });
  }
});

router.post('/:id/reassign', normalizePatientPayload, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('unit', 'name').exec();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const unitId = req.body.unitId;
    if (!unitId) {
      return res.status(400).json({ error: 'unitId is required' });
    }

    const nextUnit = await ensureUnitExists(unitId);
    const previousUnit = patient.unit;

    if (String(previousUnit?._id || previousUnit) === String(nextUnit._id)) {
      return res.json(formatPatient(patient));
    }

    patient.unit = nextUnit._id;
    patient.active = true;
    patient.dischargedAt = null;
    await patient.save();

    await syncUnitPatientCounts([previousUnit?._id || previousUnit, nextUnit._id]);
    await logActivityEventSafe({
      type: 'patient_reassigned',
      message: `${patient.name} was reassigned from ${previousUnit?.name || 'Unknown unit'} to ${nextUnit.name}`,
      metadata: {
        patientId: patient._id.toString(),
        patientName: patient.name,
        previousUnitId: previousUnit?._id?.toString?.() || previousUnit?.toString?.() || null,
        previousUnitName: previousUnit?.name || null,
        nextUnitId: nextUnit._id.toString(),
        nextUnitName: nextUnit.name,
      },
    });
    await updateBatchStats().catch(() => {});

    const populatedPatient = await Patient.findById(patient._id).populate('unit', 'name').exec();
    res.json(formatPatient(populatedPatient));
  } catch (error) {
    console.error('Error reassigning patient:', error);
    res.status(error.message === 'Unit not found' ? 404 : 500).json({ error: error.message || 'Failed to reassign patient' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('unit', 'name').exec();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const unitId = patient.unit?._id || patient.unit;
    await Patient.deleteOne({ _id: patient._id }).exec();
    await syncUnitPatientCounts([unitId]);
    await logActivityEventSafe({
      type: 'patient_deleted',
      message: `${patient.name} was removed from ${patient.unit?.name || 'Unknown unit'}`,
      metadata: {
        patientId: patient._id.toString(),
        patientName: patient.name,
        unitId: patient.unit?._id?.toString?.() || patient.unit?.toString?.() || null,
        unitName: patient.unit?.name || null,
      },
    });
    await updateBatchStats().catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting patient:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;