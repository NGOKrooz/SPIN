const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  type: { type: String, required: true },
  entityId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  action: { type: String, required: true },
  action_type: { type: String, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, required: true, alias: 'description' },
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern' },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

ActivityLogSchema.pre('save', function () {
  if (this.action) {
    this.action_type = this.action;
  }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
