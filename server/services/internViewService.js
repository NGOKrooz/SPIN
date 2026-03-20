const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');

// Helper functions (extracted from interns.js for reuse)
const toIsoString = (date) => {
  if (!date) return null;
  try {
    return new Date(date).toISOString();
  } catch (_) {
    return null;
  }
};

const getRotationStatus = (rotation, today = new Date()) => {
  const start = rotation.startDate ? new Date(rotation.startDate) : new Date(rotation.start_date);
  const end = rotation.endDate ? new Date(rotation.endDate) : new Date(rotation.end_date);
  if (!start || !end) return 'upcoming';

  if (start <= today && end >= today) return 'active';
  if (start > today) return 'upcoming';
  return 'completed';
};

const formatRotation = (rotation) => {
  const status = getRotationStatus(rotation);

  const unit = rotation.unitId || rotation.unit || rotation.unit_id || null;
  const unitId = unit?._id?.toString() || unit?.id || null;
  const unitName = unit?.name || (rotation.unit_name || null);

  return {
    id: rotation._id?.toString(),
    startDate: toIsoString(rotation.startDate || rotation.start_date),
    endDate: toIsoString(rotation.endDate || rotation.end_date),
    start_date: toIsoString(rotation.startDate || rotation.start_date),
    end_date: toIsoString(rotation.endDate || rotation.end_date),
    status,
    unitId,
    unit_id: unitId,
    unitName,
    unit_name: unitName,
    isManualAssignment: Boolean(rotation.isManualAssignment || rotation.is_manual_assignment),
    is_manual_assignment: Boolean(rotation.isManualAssignment || rotation.is_manual_assignment),
    unit: unit ? {
      id: unitId,
      name: unitName,
      durationDays: unit.durationDays || unit.duration_days || null,
      duration_days: unit.durationDays || unit.duration_days || null,
      duration: unit.duration || unit.durationDays || unit.duration_days || null,
      position: unit.position || unit.order || null,
      position_order: unit.position || unit.order || null,
    } : null,
  };
};

const formatIntern = (intern, rotations = []) => {
  const today = new Date();
  const formattedRotations = (rotations || []).map(formatRotation);

  const currentRotation = formattedRotations.find(r => r.status === 'active');
  const upcomingRotations = formattedRotations.filter(r => r.status === 'upcoming');
  const completedRotations = formattedRotations.filter(r => r.status === 'completed');

  const startDate = intern.startDate || intern.start_date;

  const currentUnit = currentRotation?.unit || (intern.currentUnit ? {
    id: intern.currentUnit._id?.toString?.() || intern.currentUnit.toString(),
    name: intern.currentUnit.name || null,
  } : null);

  return {
    id: intern._id?.toString(),
    name: intern.name || '',
    email: intern.email || null,
    startDate: toIsoString(startDate),
    start_date: toIsoString(startDate),
    gender: intern.gender || null,
    batch: intern.batch || null,
    status: intern.status || null,
    extensionDays: intern.extensionDays || intern.extension_days || 0,
    extension_days: intern.extensionDays || intern.extension_days || 0,
    phoneNumber: intern.phoneNumber || intern.phone_number || '',
    phone_number: intern.phoneNumber || intern.phone_number || '',
    currentUnit,
    rotations: formattedRotations,
    upcomingUnits: upcomingRotations,
    completedUnits: completedRotations,
    createdAt: toIsoString(intern.createdAt),
    updatedAt: toIsoString(intern.updatedAt),
  };
};

/**
 * Central data builder for intern views
 * Builds comprehensive intern data with rotations and unit information
 * @param {string} internId - The intern ID to build view for
 * @returns {Promise<Object>} Formatted intern data with rotations
 */
const buildInternView = async (internId) => {
  try {
    const intern = await Intern.findById(internId).populate('currentUnit').populate('rotations').exec();
    if (!intern) {
      throw new Error('Intern not found');
    }

    const rotations = await Rotation.find({ intern: intern._id })
      .populate('unit')
      .sort({ startDate: 1 })
      .exec();

    return formatIntern(intern, rotations);
  } catch (error) {
    console.error('Error building intern view:', error);
    throw error;
  }
};

/**
 * Build intern views for multiple interns
 * @param {Array<string>} internIds - Array of intern IDs
 * @returns {Promise<Array<Object>>} Array of formatted intern data
 */
const buildInternViews = async (internIds) => {
  try {
    const interns = await Intern.find({ _id: { $in: internIds } }).populate('currentUnit').populate('rotations').exec();
    const rotations = await Rotation.find({ intern: { $in: internIds } })
      .populate('unit')
      .sort({ startDate: 1 })
      .exec();

    const rotationsByIntern = rotations.reduce((acc, rotation) => {
      const key = rotation.intern?.toString();
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(rotation);
      return acc;
    }, {});

    return interns.map(intern => formatIntern(intern, rotationsByIntern[intern._id.toString()] || []));
  } catch (error) {
    console.error('Error building intern views:', error);
    throw error;
  }
};

module.exports = {
  buildInternView,
  buildInternViews,
  formatIntern,
  formatRotation,
  getRotationStatus
};