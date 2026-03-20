const mongoose = require('mongoose');

const InternSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  startDate: { type: Date, default: Date.now },
  currentUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  rotations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rotation' }],
  extensionDays: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Optional email index: avoid duplicate null constraints and preserve no strict uniqueness by default
InternSchema.index({ email: 1 }, { unique: false, sparse: true });

InternSchema.set('toJSON', { virtuals: true });
InternSchema.set('toObject', { virtuals: true });

InternSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Intern', InternSchema);
