const mongoose = require('mongoose');

const RotationSchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  startDate: { type: Date, required: true },
  baseDuration: { type: Number },
  manualExtensionDays: { type: Number, default: 0 },
  autoExtensionDays: { type: Number, default: 0 },
  extensionDays: { type: Number, default: 0 },
  duration: { type: Number, default: 20 },
  endDate: { type: Date },
  actualEndDate: { type: Date }, // PHASE 2: Records when admin actually accepted movement
  // Strict single-source-of-truth: only allow lifecycle statuses 'active', 'upcoming', 'completed'
  status: { type: String, enum: ['active', 'upcoming', 'completed'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rotation', RotationSchema);
