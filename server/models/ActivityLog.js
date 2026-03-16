const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  activityType: { type: String, required: true },
  internId: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', default: null },
  internName: { type: String, default: null },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  unitName: { type: String, default: null },
  details: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
