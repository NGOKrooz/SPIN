const mongoose = require('mongoose');

const WorkloadHistorySchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  recordedAt: { type: Date, default: Date.now },
  internCount: { type: Number, default: 0 },
  workload: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' }
});

module.exports = mongoose.model('WorkloadHistory', WorkloadHistorySchema);
