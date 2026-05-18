const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const connectDB = require('../config/database');
const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const {
  normalizeRotation,
  getRotationUnitId,
  isValidRotationStatus,
  collectRotationIntegrityIssues,
} = require('../services/assignmentUtils');

const REPORT_PATH = path.resolve(__dirname, '../../ROTATION_DATA_RECOVERY_REPORT.md');

const formatDate = (value) => {
  if (!value) return 'MISSING';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'INVALID' : date.toISOString().split('T')[0];
};

async function loadUnits() {
  const units = await Unit.find().lean().exec();
  return new Map(units.map((unit) => [String(unit._id), unit]));
}

function formatRotationIssues(rotation, unitsById) {
  const unitId = getRotationUnitId(rotation);
  const unitExists = unitId ? unitsById.has(String(unitId)) : false;
  return {
    rotationId: rotation._id?.toString?.() || 'unknown',
    status: String(rotation.status || 'undefined'),
    unitId: unitId || 'missing',
    unitExists,
    startDate: formatDate(rotation.startDate || rotation.start_date),
    endDate: formatDate(rotation.endDate || rotation.end_date),
  };
}

async function auditRotationIntegrity() {
  await connectDB();
  const unitsById = await loadUnits();
  const interns = await Intern.find().lean().exec();

  const reportRows = [];
  const details = [];

  for (const intern of interns) {
    const rotations = await Rotation.find({ intern: intern._id }).lean().exec();
    const issues = collectRotationIntegrityIssues(rotations);

    const totalAssignments = rotations.length;
    const normalized = rotations.map(normalizeRotation).filter(Boolean);
    const activeAssignments = normalized.filter((rotation) => rotation.status === 'active' && getRotationUnitId(rotation)).length;
    const completedAssignments = normalized.filter((rotation) => rotation.status === 'completed').length;
    const missingUnits = rotations.filter((rotation) => !getRotationUnitId(rotation)).length;
    const missingDates = rotations.filter((rotation) => {
      const start = new Date(rotation.startDate || rotation.start_date);
      const end = new Date(rotation.endDate || rotation.end_date);
      return !rotation.startDate || Number.isNaN(start.getTime()) || !rotation.endDate || Number.isNaN(end.getTime());
    }).length;
    const duplicateActiveAssignments = Math.max(0, activeAssignments - 1);
    const orphanedUnitIds = rotations.filter((rotation) => {
      const unitId = getRotationUnitId(rotation);
      return unitId && !unitsById.has(String(unitId));
    }).length;
    const invalidStatuses = rotations.filter((rotation) => !isValidRotationStatus(rotation)).length;

    const row = {
      intern: intern.name || intern._id?.toString?.() || 'Unknown Intern',
      totalAssignments,
      activeAssignments,
      completedAssignments,
      missingUnits,
      missingDates,
      duplicateActiveAssignments,
      orphanedUnitIds,
      invalidStatuses,
    };

    console.log(row);

    if (issues.duplicateActiveAssignments || issues.missingUnits || issues.invalidStatuses || issues.missingDates) {
      console.warn('[DATA CORRUPTION DETECTED]', {
        intern: row.intern,
        duplicateActiveAssignments: issues.duplicateActiveAssignments,
        missingUnits: issues.missingUnits,
        invalidStatuses: issues.invalidStatuses,
        missingDates: issues.missingDates,
      });
    }

    reportRows.push(row);

    const rotationDetails = rotations.map((rotation) => formatRotationIssues(rotation, unitsById));
    details.push({ intern: row.intern, rotations: rotationDetails });
  }

  const header = ['# Rotation Data Recovery Report', '', `Generated: ${new Date().toISOString()}`, '', '## Summary', '', '| Intern | Total | Active | Completed | Missing Units | Missing Dates | Duplicate Active | Orphaned Unit IDs | Invalid Statuses |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const rows = reportRows.map((row) => `| ${row.intern} | ${row.totalAssignments} | ${row.activeAssignments} | ${row.completedAssignments} | ${row.missingUnits} | ${row.missingDates} | ${row.duplicateActiveAssignments} | ${row.orphanedUnitIds} | ${row.invalidStatuses} |`);

  const detailSections = details.flatMap((detail) => [
    '',
    `### ${detail.intern}`,
    '',
    '| Rotation ID | Status | Unit ID | Unit Exists | Start Date | End Date |',
    '| --- | --- | --- | --- | --- | --- |',
    ...detail.rotations.map((rotation) => `| ${rotation.rotationId} | ${rotation.status} | ${rotation.unitId} | ${rotation.unitExists ? 'yes' : 'no'} | ${rotation.startDate} | ${rotation.endDate} |`),
  ]);

  const report = [
    ...header,
    ...rows,
    '',
    '## Details',
    ...detailSections,
  ].join('\n');

  await fs.writeFile(REPORT_PATH, report, 'utf8');
  console.log(`\n✅ Rotation integrity audit written to ${REPORT_PATH}`);
  return reportRows;
}

if (require.main === module) {
  auditRotationIntegrity()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}

module.exports = {
  auditRotationIntegrity,
};
