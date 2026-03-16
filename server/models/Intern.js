const mongoose = require('mongoose');

const InternSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  batch: { type: String, enum: ['A', 'B'], required: true },
  startDate: { type: Date, required: true },
  phoneNumber: { type: String, default: null },
  status: { type: String, enum: ['Active', 'Extended', 'Completed'], default: 'Active' },
  extensionDays: { type: Number, default: 0 },
  currentUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

InternSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Intern', InternSchema);
