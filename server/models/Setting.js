const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: String, default: '' },
  description: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

SettingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Setting', SettingSchema);
