const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  internId: { type: mongoose.Schema.Types.ObjectId, ref: 'Intern', default: null },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  rotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rotation', default: null },
  type: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Activity', ActivitySchema);
