const WorkloadHistory = require('../models/WorkloadHistory');

async function createWorkloadHistory(internId, unitId, workloadScore = 0, date = new Date()) {
  const item = await WorkloadHistory.create({ intern: internId, unit: unitId, workloadScore, date });
  return item;
}

async function getWorkloadInsights() {
  const histories = await WorkloadHistory.find().populate('intern').populate('unit').sort({ date: -1 }).limit(50).exec();
  const total = await WorkloadHistory.countDocuments();
  return { total, histories };
}

module.exports = {
  createWorkloadHistory,
  getWorkloadInsights,
};
