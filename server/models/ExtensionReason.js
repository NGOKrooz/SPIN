const mongoose = require('mongoose');

const ExtensionLogSchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  rotation: { type: mongoose.Schema.Types.ObjectId, ref: 'Rotation' },
  reason: { type: String, required: true },
  days: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExtensionLog', ExtensionLogSchema);
