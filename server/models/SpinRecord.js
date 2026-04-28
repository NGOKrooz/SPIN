const mongoose = require('mongoose');

const SpinRecordSchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', default: null },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  rotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Rotation', default: null },
  next_unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  next_rotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Rotation', default: null },
  description: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  created_at: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SpinRecord', SpinRecordSchema);
