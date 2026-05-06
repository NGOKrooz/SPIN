const express = require('express');
const { body, validationResult } = require('express-validator');

const Rotation = require('../models/Rotation');
const Intern = require('../models/Intern');
const {
  getCurrentRotations,
  getUpcomingRotations,
  autoAdvanceRotation,
  createManualRotation,
  updateRotation,
  deleteRotation,
} = require('../services/rotationService');
const { reshuffleAllUpcoming } = require('../services/rotationPlanService');
const { assignNextUnit, ensurePendingConfirmation } = require('../services/dynamicAssignmentService');
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

// POST /api/rotations/refresh-upcoming - Rebuild all upcoming rotations without touching active/completed assignments
router.post('/refresh-upcoming', async (req, res) => {
  try {
    const refreshResult = await reshuffleAllUpcoming();
    res.json({ success: true, ...refreshResult });
  } catch (err) {
    console.error('Error refreshing upcoming rotations:', err);
    res.status(500).json({ error: 'Failed to refresh upcoming rotations' });
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

// POST /api/rotations/auto-advance - Trigger auto-advance and create pending confirmation movements when appropriate
router.post('/auto-advance', async (req, res) => {
  try {
    const { internId } = req.body;
    if (!internId) {
      return res.status(400).json({ error: 'internId is required' });
    }

    const intern = await Intern.findById(internId).exec();
    if (!intern) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const activeRotation = await Rotation.findOne({ intern: intern._id, status: 'active' })
      .sort({ startDate: -1, createdAt: -1 })
      .exec();

    const pendingRotation = await ensurePendingConfirmation(intern._id, activeRotation, new Date());
    res.json({
      autoAdvanced: Boolean(pendingRotation),
      pendingConfirmation: Boolean(pendingRotation),
      pendingRotation,
    });
  } catch (err) {
    console.error('Error auto-advancing rotation:', err);
    res.status(500).json({ error: 'Failed to auto-advance rotation' });
  }
});

// POST /api/rotations/:id/accept - Accept a pending confirmation movement and activate it
router.post('/:id/accept', async (req, res) => {
  try {
    const rotationId = req.params.id;
    if (!rotationId) {
      return res.status(400).json({ error: 'Rotation ID is required' });
    }

    const pendingRotation = await Rotation.findById(rotationId).populate('intern').populate('unit').exec();
    if (!pendingRotation) {
      return res.status(404).json({ error: 'Rotation not found' });
    }

    if (pendingRotation.status !== 'pending_confirmation') {
      return res.status(400).json({ error: 'Rotation is not pending confirmation' });
    }

    const activeRotation = await Rotation.findOne({ intern: pendingRotation.intern._id, status: 'active' })
      .sort({ startDate: -1, createdAt: -1 })
      .exec();

    if (activeRotation) {
      activeRotation.status = 'completed';
      await activeRotation.save();
    }

    pendingRotation.status = 'active';
    await pendingRotation.save();

    await Intern.findByIdAndUpdate(pendingRotation.intern._id, { currentUnit: pendingRotation.unit._id }).exec();
    const acceptedRotation = await Rotation.findById(rotationId).populate('intern').populate('unit').exec();

    res.json({ success: true, rotation: acceptedRotation });
  } catch (err) {
    console.error('Error accepting rotation:', err);
    res.status(500).json({ error: 'Failed to accept pending rotation' });
  }
});

module.exports = router;
