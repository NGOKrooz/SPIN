const mongoose = require('mongoose');

const SystemStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, default: '' },
  description: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

SystemStateSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SystemState', SystemStateSchema);
