const mongoose = require('mongoose');

const ExtensionReasonSchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  daysAdded: { type: Number, required: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExtensionReason', ExtensionReasonSchema);
