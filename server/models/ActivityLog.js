const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  type: { type: String, required: true },
  entityId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, required: true },
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern' },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
