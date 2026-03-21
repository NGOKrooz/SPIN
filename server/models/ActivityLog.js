const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
