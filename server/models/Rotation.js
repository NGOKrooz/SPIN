const mongoose = require('mongoose');

const RotationSchema = new mongoose.Schema({
  internId: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isManualAssignment: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rotation', RotationSchema);
