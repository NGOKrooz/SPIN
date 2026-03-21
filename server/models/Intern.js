const mongoose = require('mongoose');

const InternSchema = new mongoose.Schema({
  name: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  batch: { type: String, enum: ['A', 'B', 'C', ''], default: '' },
  phoneNumber: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Extended', 'Completed', 'Inactive', ''], default: 'Active' },
  startDate: { type: Date, default: Date.now },
  currentUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  rotationHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rotation' }],
  extensionDays: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

InternSchema.set('collection', 'interns');
InternSchema.set('toJSON', { virtuals: true });
InternSchema.set('toObject', { virtuals: true });

InternSchema.pre('save', function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('Intern', InternSchema);
