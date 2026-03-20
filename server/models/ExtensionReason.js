const mongoose = require('mongoose');

const ExtensionReasonSchema = new mongoose.Schema({
  internId: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  rotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rotation', default: null },
  reason: { type: String, required: true, trim: true },
  days: { type: Number, required: true, min: 1 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExtensionReason', ExtensionReasonSchema);
