const mongoose = require('mongoose');

const WorkloadHistorySchema = new mongoose.Schema({
  intern: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  workloadScore: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WorkloadHistory', WorkloadHistorySchema);
