const express = require('express');
const {
  getSpinHistory,
  getSpinCount,
  getSpinCountsByIntern,
} = require('../services/spinService');

const router = express.Router();

function parseLimit(rawValue, fallback = 20, max = 1000) {
  if (rawValue === 'all' || rawValue === 'unlimited') {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

router.get('/', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 1000);
    const [recent, spinCounts] = await Promise.all([
      getSpinHistory(limit),
      getSpinCountsByIntern(),
    ]);

    res.json({
      totalSpins: spinCounts.totalSpins,
      internSpins: spinCounts.internSpins,
      recent,
    });
  } catch (err) {
    console.error('Error fetching spun history:', err);
    res.status(500).json({ error: 'Failed to fetch spun history' });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 20, 1000);
    const recent = await getSpinHistory(limit);
    res.json(recent);
  } catch (err) {
    console.error('Error fetching recent spun records:', err);
    res.status(500).json({ error: 'Failed to fetch recent spun records' });
  }
});

module.exports = router;
