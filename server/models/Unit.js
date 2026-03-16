const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  durationDays: { type: Number, required: true, default: 7 },
  capacity: { type: Number, default: 0 },
  workload: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  patientCount: { type: Number, default: 0 },
  description: { type: String, default: null },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

UnitSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Unit', UnitSchema);
