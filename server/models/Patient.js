const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
  admittedAt: { type: Date, default: Date.now },
  dischargedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PatientSchema.set('toJSON', { virtuals: true });
PatientSchema.set('toObject', { virtuals: true });

PatientSchema.pre('save', function () {
  this.updatedAt = new Date();
  if (!this.active && !this.dischargedAt) {
    this.dischargedAt = new Date();
  }
  if (this.active) {
    this.dischargedAt = null;
  }
});

module.exports = mongoose.model('Patient', PatientSchema);