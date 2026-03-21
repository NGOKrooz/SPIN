const ExtensionReason = require('../models/ExtensionReason');

async function createExtensionReason(internId, daysAdded, reason = '') {
  const reasonDoc = await ExtensionReason.create({ intern: internId, daysAdded, reason });
  return reasonDoc;
}

async function getExtensionHistory(internId = null) {
  const query = internId ? { intern: internId } : {};
  return await ExtensionReason.find(query).populate('intern').sort({ createdAt: -1 }).limit(50).exec();
}

module.exports = {
  createExtensionReason,
  getExtensionHistory,
};
