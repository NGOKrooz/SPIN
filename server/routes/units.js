const express = require('express');
const { body, validationResult } = require('express-validator');

const Unit = require('../models/Unit');
const Rotation = require('../models/Rotation');
const { createUnit, updateUnit, deleteUnit } = require('../services/unitService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');

const router = express.Router();

const validateUnitPayload = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Unit name must be 2-100 characters'),
  body('durationDays').optional().isInt({ min: 1, max: 365 }).withMessage('Duration must be 1-365 days'),
  body('workload').optional().isIn(['Low', 'Medium', 'High']).withMessage('Workload must be Low, Medium, or High'),
  body('patientCount').optional().isInt({ min: 0 }).withMessage('Patient count must be a non-negative integer'),
];

// GET /api/units - Get all units
router.get('/', async (req, res) => {
  try {
    const units = await Unit.find({}).sort({ position: 1, name: 1 }).exec();

    // Count current active interns per unit (today)
    const today = new Date();
    const activeRotations = await Rotation.find({
      startDate: { $lte: today },
      endDate: { $gte: today },
    }).exec();

    const counts = activeRotations.reduce((acc, rotation) => {
      const key = String(rotation.unitId);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const result = units.map(unit => ({
      ...unit.toObject(),
      currentInterns: counts[String(unit._id)] || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// GET /api/units/:id - Get specific unit
router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).exec();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const rotations = await Rotation.find({ unitId: unit._id })
      .populate('internId')
      .sort({ startDate: 1 })
      .exec();

    res.json({ ...unit.toObject(), rotations });
  } catch (err) {
    console.error('Error fetching unit:', err);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// POST /api/units - Create new unit
router.post('/', validateUnitPayload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const unit = await createUnit(req.body);
    await logRecentUpdateSafe('unit_created', `Created unit: ${unit.name}`);
    res.status(201).json(unit);
  } catch (err) {
    console.error('Error creating unit:', err);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// PUT /api/units/:id - Update unit
router.put('/:id', validateUnitPayload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const unit = await updateUnit(req.params.id, req.body);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    await logRecentUpdateSafe('unit_updated', `Updated unit: ${unit.name}`);
    res.json(unit);
  } catch (err) {
    console.error('Error updating unit:', err);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// DELETE /api/units/:id - Delete unit and related rotations
router.delete('/:id', async (req, res) => {
  try {
    const unit = await deleteUnit(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    await Rotation.deleteMany({ unitId: unit._id }).exec();
    await logRecentUpdateSafe('unit_deleted', `Deleted unit: ${unit.name}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting unit:', err);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

// PUT /api/units/reorder - Update unit order
router.put('/reorder', async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Payload must be an array of { id, position } objects' });
  }

  try {
    const updates = items.map(item => {
      if (!item || !item.id) return null;
      return Unit.findByIdAndUpdate(item.id, { position: item.position || 0 }).exec();
    }).filter(Boolean);

    await Promise.all(updates);
    await logRecentUpdateSafe('units_reordered', 'Updated unit ordering');
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering units:', err);
    res.status(500).json({ error: 'Failed to reorder units' });
  }
});

module.exports = router;
