const mongoose = require('mongoose');

const InternSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, default: null },
  gender: { type: String, enum: ['Male', 'Female'], default: null },
  batch: { type: String, enum: ['A', 'B'], default: null },
  startDate: { type: Date, required: true, default: Date.now },
  phoneNumber: { type: String, default: null },
  status: { type: String, enum: ['Active', 'Extended', 'Completed'], default: 'Active' },
  extensionDays: { type: Number, default: 0 },
  currentUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Optional email index: avoid duplicate null constraints and preserve no strict uniqueness by default
InternSchema.index({ email: 1 }, { unique: false, sparse: true });

InternSchema.virtual('rotations', {
  ref: 'Rotation',
  localField: '_id',
  foreignField: 'internId',
});

InternSchema.virtual('activityLogs', {
  ref: 'Activity',
  localField: '_id',
  foreignField: 'internId',
});

InternSchema.set('toJSON', { virtuals: true });
InternSchema.set('toObject', { virtuals: true });

InternSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Intern', InternSchema);
