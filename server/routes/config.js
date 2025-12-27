// API Configuration endpoint to check feature flags
const express = require('express');
const router = express.Router();
const { isAutoRotationEnabled } = require('../utils/autoRotation');

// GET /api/config - Get public configuration
router.get('/', (req, res) => {
  const config = {
    autoRotationEnabled: isAutoRotationEnabled(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  };
  
  res.json(config);
});

module.exports = router;

