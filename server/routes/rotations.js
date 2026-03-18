const express = require('express');
const { body, validationResult } = require('express-validator');

const Rotation = require('../models/Rotation');
const {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
} = require('../services/rotationService');
const { logRecentUpdateSafe } = require('../services/recentUpdatesService');

const router = express.Router();

const validateRotation = [
  body('internId').notEmpty().withMessage('internId is required'),
  body('unitId').notEmpty().withMessage('unitId is required'),
  body('startDate').isISO8601().withMessage('startDate must be a valid date'),
  body('endDate').isISO8601().withMessage('endDate must be a valid date'),
];

// GET /api/rotations/current - Get current rotations (used by dashboard)
router.get('/current', async (req, res) => {
  try {
    const rotations = await getCurrentRotations();

    // Build simple unit coverage info for dashboard
    const unitCoverage = {};

    rotations.forEach((rotation) => {
      const unitName = rotation.unitId?.name || 'Unknown Unit';
      const intern = rotation.internId || {};
      const batch = intern.batch || 'A';
      const internInfo = { id: intern._id?.toString(), name: intern.name };

      if (!unitCoverage[unitName]) {
        unitCoverage[unitName] = {
          unit_name: unitName,
          batch_a: [],
          batch_b: [],
          coverage_status: 'ok',
        };
      }

      const bucket = batch === 'B' ? 'batch_b' : 'batch_a';
      unitCoverage[unitName][bucket].push(internInfo);
    });

    Object.values(unitCoverage).forEach((unit) => {
      const hasBatchA = unit.batch_a.length > 0;
      const hasBatchB = unit.batch_b.length > 0;

      if (!hasBatchA && !hasBatchB) {
        unit.coverage_status = 'critical';
      } else if (!hasBatchA || !hasBatchB) {
        unit.coverage_status = 'critical';
      } else if (Math.abs(unit.batch_a.length - unit.batch_b.length) > 1) {
        unit.coverage_status = 'warning';
      } else {
        unit.coverage_status = 'ok';
      }
    });

    res.json({ rotations, unit_coverage: unitCoverage });
  } catch (err) {
    console.error('Error fetching current rotations:', err);
    res.status(500).json({ error: 'Failed to fetch current rotations' });
  }
});

// GET /api/rotations/upcoming - Get upcoming rotations (used by dashboard)
router.get('/upcoming', async (req, res) => {
  try {
    const rotations = await getUpcomingRotations();
    res.json(rotations);
  } catch (err) {
    console.error('Error fetching upcoming rotations:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming rotations' });
  }
});

// GET /api/rotations - List rotations (optionally current/upcoming)
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;

    if (type === 'current') {
      const rotations = await getCurrentRotations();
      return res.json(rotations);
    }

    if (type === 'upcoming') {
      const rotations = await getUpcomingRotations();
      return res.json(rotations);
    }

    // Default: return all rotations
    const rotations = await Rotation.find({})
      .populate('internId')
      .populate('unitId')
      .sort({ startDate: 1 })
      .exec();

    res.json(rotations);
  } catch (err) {
    console.error('Error fetching rotations:', err);
    res.status(500).json({ error: 'Failed to fetch rotations' });
  }
});

// POST /api/rotations - Create a new rotation
router.post('/', validateRotation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const rotation = await createManualRotation(req.body);
    await logRecentUpdateSafe('rotation_created', `Created rotation for intern ${rotation.internId}`);
    res.status(201).json(rotation);
  } catch (err) {
    console.error('Error creating rotation:', err);
    res.status(500).json({ error: 'Failed to create rotation' });
  }
});

// PUT /api/rotations/:id - Update rotation
router.put('/:id', async (req, res) => {
  try {
    const updated = await updateRotation(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Rotation not found' });

    await logRecentUpdateSafe('rotation_updated', `Updated rotation ${updated._id}`);
    res.json(updated);
  } catch (err) {
    console.error('Error updating rotation:', err);
    res.status(500).json({ error: 'Failed to update rotation' });
  }
});

// DELETE /api/rotations/:id - Delete rotation
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteRotation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Rotation not found' });

    await logRecentUpdateSafe('rotation_deleted', `Deleted rotation ${deleted._id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting rotation:', err);
    res.status(500).json({ error: 'Failed to delete rotation' });
  }
});

// POST /api/rotations/auto-advance - Trigger auto-advance
router.post('/auto-advance', async (req, res) => {
  try {
    const { internId } = req.body;
    if (!internId) {
      return res.status(400).json({ error: 'internId is required' });
    }

    const result = await autoAdvanceRotation(internId);
    res.json({ autoAdvanced: result });
  } catch (err) {
    console.error('Error auto-advancing rotation:', err);
    res.status(500).json({ error: 'Failed to auto-advance rotation' });
  }
});

module.exports = router;
