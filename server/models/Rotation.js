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
  actualEndDate: { type: Date },
  workflowState: { type: String, enum: ['pending_confirmation', 'confirmed', ''], default: null },
  status: { type: String, enum: ['active', 'upcoming', 'completed', 'awaiting_confirmation'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rotation', RotationSchema);
