const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  action_type: { type: String, required: true, maxlength: 100 },
  description: { type: String, required: true },
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', default: null },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  created_at: { type: Date, default: Date.now, index: true },
  // Legacy fields for backward compatibility
  type: { type: String, default: null },
  entityId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  action: { type: String, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
