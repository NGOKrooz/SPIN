const mongoose = require('mongoose');

const UnitSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true },
  durationDays: { type: Number, default: 20 },
  capacity: { type: Number, default: 5 },
  patientCount: { type: Number, default: 0 },
  description: { type: String, default: null },
  position: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Provide a consistent field name for duration (API may use duration)
UnitSchema.virtual('duration').get(function () {
  return this.durationDays;
});
UnitSchema.virtual('duration').set(function (value) {
  if (typeof value === 'number') {
    this.durationDays = value;
  }
});

UnitSchema.set('toJSON', { virtuals: true });
UnitSchema.set('toObject', { virtuals: true });

UnitSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Unit', UnitSchema);
