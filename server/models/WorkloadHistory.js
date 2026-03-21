const mongoose = require('mongoose');

const WorkloadHistorySchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  workloadScore: { type: Number, default: 0 },
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

WorkloadHistorySchema.pre('save', function (next) {
  this.createdAt = this.createdAt || new Date();
  next();
});

module.exports = mongoose.model('WorkloadHistory', WorkloadHistorySchema);
