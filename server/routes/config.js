// API Configuration endpoint to check feature flags
const express = require('express');
const router = express.Router();

// GET /api/config - Get public configuration
router.get('/', (req, res) => {
  const config = {
    autoRotationEnabled: process.env.AUTO_ROTATION === 'true',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  };
  
  res.json(config);
});

module.exports = router;

