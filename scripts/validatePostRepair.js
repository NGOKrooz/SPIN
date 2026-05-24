#!/usr/bin/env node
const path = require('path');
const fs = require('fs/promises');

const serverModules = path.join(__dirname, '../server/node_modules');
module.paths.unshift(serverModules);

require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const mongoose = require('mongoose');
const Intern = require('../server/models/Intern');
const Rotation = require('../server/models/Rotation');
const Unit = require('../server/models/Unit');
const { buildInternViews } = require('../server/services/internViewService');
const { resolveCurrentAssignment } = require('../server/services/assignmentUtils');
const { getUnitOccupancy, assignFirstUnit, getEligibleUnits } = require('../server/services/dynamicAssignmentService');

const VALID_STATUSES = new Set(['active', 'upcoming', 'completed']);
const REPORT_FILE = path.join(__dirname, '../POST_REPAIR_VALIDATION_REPORT.md');
const MAX_SAMPLE_ERRORS = 10;

function formatSection(title) {
  return `## ${title}\n\n`;
}

function formatList(items = []) {
  return items.length === 0 ? 'None\n' : items.map((item) => `- ${item}`).join('\n') + '\n';
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function runValidation() {
  const results = {
    passed: 0,
    warnings: 0,
    failed: 0,
    details: [],
  };

  const reportParts = [];

  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    reportParts.push('# POST-REPAIR VALIDATION REPORT\n');
    reportParts.push(`Generated: ${new Date().toISOString()}\n\n`);

    await mongoose.connect(mongoUri, { retryWrites: true, w: 'majority' });
    reportParts.push('✅ Connected to MongoDB\n\n');

    const [interns, rotations, units] = await Promise.all([
      Intern.find().lean().exec(),
      Rotation.find().lean().exec(),
      Unit.find().lean().exec(),
    ]);

    reportParts.push(formatSection('Summary Metrics'));
    reportParts.push(`- Interns: ${interns.length}\n`);
    reportParts.push(`- Rotations: ${rotations.length}\n`);
    reportParts.push(`- Units: ${units.length}\n\n`);

    const internViews = await buildInternViews(interns.map((intern) => intern._id));

    const internMap = new Map(interns.map((intern) => [String(intern._id), intern]));
    const unitMap = new Map(units.map((unit) => [String(unit._id), unit]));

    // Status and legacy checks
    reportParts.push(formatSection('Rotation Status Validation'));
    const invalidStatusRotations = rotations.filter((rotation) => !VALID_STATUSES.has(String(rotation.status || '').trim().toLowerCase()));
    if (invalidStatusRotations.length > 0) {
      results.failed += 1;
      reportParts.push(`- Invalid rotations: ${invalidStatusRotations.length}\n`);
      reportParts.push(formatList(invalidStatusRotations.slice(0, MAX_SAMPLE_ERRORS).map((rotation) => `Rotation ${rotation._id} status='${rotation.status}' intern='${rotation.intern}'`)));
      if (invalidStatusRotations.length > MAX_SAMPLE_ERRORS) {
        reportParts.push(`- ...plus ${invalidStatusRotations.length - MAX_SAMPLE_ERRORS} more invalid rotations\n`);
      }
    } else {
      results.passed += 1;
      reportParts.push('- All rotation statuses are valid.\n');
    }

    const legacyWorkflows = rotations.filter((rotation) => rotation.workflowState !== undefined || rotation.awaiting_confirmation !== undefined);
    reportParts.push(formatSection('Legacy Workflow Field Validation'));
    if (legacyWorkflows.length > 0) {
      results.failed += 1;
      reportParts.push(`- Legacy workflow fields still present: ${legacyWorkflows.length}\n`);
      reportParts.push(formatList(legacyWorkflows.slice(0, MAX_SAMPLE_ERRORS).map((rotation) => `Rotation ${rotation._id} intern='${rotation.intern}' workflowState='${rotation.workflowState}' awaiting_confirmation='${rotation.awaiting_confirmation}'`)));
      if (legacyWorkflows.length > MAX_SAMPLE_ERRORS) {
        reportParts.push(`- ...plus ${legacyWorkflows.length - MAX_SAMPLE_ERRORS} more rotations with legacy workflow fields\n`);
      }
    } else {
      results.passed += 1;
      reportParts.push('- No legacy workflow fields found.\n');
    }

    const internsWithoutAssignments = interns.filter((intern) => !rotations.some((rotation) => String(rotation.intern) === String(intern._id)));
    reportParts.push(formatSection('Intern Assignment Coverage'));
    if (internsWithoutAssignments.length > 0) {
      results.warnings += 1;
      reportParts.push(`- Interns without any rotations: ${internsWithoutAssignments.length}\n`);
      reportParts.push(formatList(internsWithoutAssignments.slice(0, MAX_SAMPLE_ERRORS).map((intern) => `${intern.name || intern._id} (${intern._id})`)));
      if (internsWithoutAssignments.length > MAX_SAMPLE_ERRORS) {
        reportParts.push(`- ...plus ${internsWithoutAssignments.length - MAX_SAMPLE_ERRORS} more interns without assignments\n`);
      }
    } else {
      results.passed += 1;
      reportParts.push('- All interns have at least one rotation record.\n');
    }

    // Intern-by-intern validation
    const invalidInterns = [];
    const activeDuplicateInterns = [];
    const upcomingDuplicateInterns = [];
    const missingUnitIssues = [];
    const completedCountMismatch = [];
    const pendingConfirmationInterns = [];
    const dashboardIssues = [];

    for (const internView of internViews) {
      const internId = String(internView.id);
      const rawIntern = internMap.get(internId) || {};
      const rotationsForIntern = internView.rotations || [];
      const activeRotations = rotationsForIntern.filter((rotation) => String(rotation.status || '').toLowerCase() === 'active');
      const upcomingRotations = rotationsForIntern.filter((rotation) => String(rotation.status || '').toLowerCase() === 'upcoming');
      const completedRotations = rotationsForIntern.filter((rotation) => String(rotation.status || '').toLowerCase() === 'completed');

      if (activeRotations.length > 1) {
        activeDuplicateInterns.push(`${internView.name || internId}: ${activeRotations.length} active rotations`);
      }
      if (upcomingRotations.length > 1) {
        upcomingDuplicateInterns.push(`${internView.name || internId}: ${upcomingRotations.length} upcoming rotations`);
      }

      if (activeRotations.length === 1 && (!internView.currentUnit || !internView.currentUnit.id || !internView.currentUnit.name)) {
        missingUnitIssues.push(`${internView.name || internId}: active rotation missing currentUnit metadata`);
      }
      if (upcomingRotations.length === 1 && (!upcomingRotations[0].unitId || !upcomingRotations[0].unitName)) {
        missingUnitIssues.push(`${internView.name || internId}: upcoming rotation missing unit metadata`);
      }

      const completedCount = rotations.filter((rotation) => String(rotation.intern) === internId && String(rotation.status || '').toLowerCase() === 'completed').length;
      if (completedCount !== completedRotations.length) {
        completedCountMismatch.push(`${internView.name || internId}: completed DB=${completedCount} view=${completedRotations.length}`);
      }

      if (internView.awaitingConfirmationUnits && internView.awaitingConfirmationUnits.length > 0) {
        pendingConfirmationInterns.push(`${internView.name || internId}: ${internView.awaitingConfirmationUnits.length} pending confirmation`);
      }

      if (!internView.dashboard) {
        dashboardIssues.push(`${internView.name || internId}: missing dashboard payload`);
      } else {
        if (!internView.dashboard.currentUnit && internView.primaryStatus === 'ACTIVE') {
          dashboardIssues.push(`${internView.name || internId}: active intern missing dashboard.currentUnit`);
        }
      }
    }

    reportParts.push(formatSection('Current / Upcoming Assignment Consistency'));
    if (activeDuplicateInterns.length > 0) {
      results.failed += 1;
      reportParts.push(`- Duplicate active rotations found for ${activeDuplicateInterns.length} interns.\n`);
      reportParts.push(formatList(activeDuplicateInterns.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push('- No interns have more than one active rotation.\n');
    }

    if (upcomingDuplicateInterns.length > 0) {
      results.failed += 1;
      reportParts.push(`- Duplicate upcoming rotations found for ${upcomingDuplicateInterns.length} interns.\n`);
      reportParts.push(formatList(upcomingDuplicateInterns.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push('- No interns have more than one upcoming rotation.\n');
    }

    if (missingUnitIssues.length > 0) {
      results.failed += 1;
      reportParts.push(`- ${missingUnitIssues.length} interns with rotation unit metadata issues.\n`);
      reportParts.push(formatList(missingUnitIssues.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push('- All active and upcoming rotations include valid unit metadata.\n');
    }

    if (completedCountMismatch.length > 0) {
      results.failed += 1;
      reportParts.push(`- ${completedCountMismatch.length} interns have completed history mismatch between DB and view.\n`);
      reportParts.push(formatList(completedCountMismatch.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push('- Completed rotation history is consistent between DB and intern view.\n');
    }

    reportParts.push(formatSection('Awaiting Confirmation / Dashboard Payload'));
    if (pendingConfirmationInterns.length > 0) {
      results.passed += 1;
      reportParts.push(`- ${pendingConfirmationInterns.length} interns currently have awaiting-confirmation state in the view.\n`);
      reportParts.push(formatList(pendingConfirmationInterns.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      reportParts.push('- No awaiting confirmation interns detected in this snapshot.\n');
    }
    if (dashboardIssues.length > 0) {
      results.failed += 1;
      reportParts.push(`- Dashboard payload issues detected for ${dashboardIssues.length} interns.\n`);
      reportParts.push(formatList(dashboardIssues.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push('- Dashboard view payload appears complete for all interns.\n');
    }

    reportParts.push(formatSection('Unit Capacity Enforcement'));
    const occupancy = await getUnitOccupancy();
    const overCapacity = [];
    for (const unit of units) {
      const unitId = String(unit._id);
      const count = occupancy.get(unitId) || 0;
      const capacity = Number(unit.capacity || unit.maxCapacity || 5);
      if (count > capacity) {
        overCapacity.push(`${unit.name || unitId}: ${count}/${capacity}`);
      }
    }
    if (overCapacity.length > 0) {
      results.failed += 1;
      reportParts.push(`- Units over capacity: ${overCapacity.length}\n`);
      reportParts.push(formatList(overCapacity.slice(0, MAX_SAMPLE_ERRORS)));
    } else {
      results.passed += 1;
      reportParts.push(`- All units are within capacity.\n`);
    }

    reportParts.push(formatSection('New Intern Assignment Validation'));
    const testInternName = `POST_REPAIR_VALIDATION_TEST_${Date.now()}`;
    let testIntern = null;
    let testRotation = null;
    try {
      if (!units.length) {
        throw new Error('No configured units available to validate first assignment');
      }
      testIntern = await Intern.create({
        name: testInternName,
        gender: 'Male',
        batch: 'A',
        phone: '0000000000',
        status: 'active',
        extensionDays: 0,
        totalExtensionDays: 0,
        startDate: new Date(),
      });
      const allowedUnits = units.map((unit) => ({ ...unit, _id: unit._id }));
      const result = await assignFirstUnit(testIntern, allowedUnits);
      if (!result || !result.rotation || !result.unit) {
        throw new Error('assignFirstUnit did not create an active rotation');
      }
      testRotation = result.rotation;
      results.passed += 1;
      reportParts.push(`- New intern assignment succeeded with unit '${result.unit.name}'.\n`);
    } catch (err) {
      results.failed += 1;
      reportParts.push(`- New intern assignment failed: ${err.message}\n`);
    } finally {
      if (testRotation) {
        await Rotation.deleteOne({ _id: testRotation._id }).exec();
      }
      if (testIntern) {
        await Intern.deleteOne({ _id: testIntern._id }).exec();
      }
    }

    reportParts.push(formatSection('Reassignability Check'));
    const sampleReassignIssues = [];
    let reassignableFound = false;
    for (const internView of internViews) {
      if (reassignableFound) break;
      const activeRotation = resolveCurrentAssignment({ rotations: internView.rotations || [] });
      if (!activeRotation) continue;
      const currentUnitId = activeRotation.unitId || activeRotation.unit_id;
      const eligibleUnits = await getEligibleUnits(internView.id, currentUnitId);
      if (eligibleUnits.length > 0) {
        reassignableFound = true;
        reportParts.push(`- Found at least one intern with an eligible reassign target: ${internView.name} (${eligibleUnits[0].name}).\n`);
      } else {
        sampleReassignIssues.push(`${internView.name || internView.id}: no eligible units available`);
      }
    }
    if (!reassignableFound) {
      results.warnings += 1;
      reportParts.push('- No intern currently has a reassignable upcoming unit target; this may be due to capacity or completed-unit coverage.\n');
    }

    reportParts.push(formatSection('Consistency Notes'));
    if (results.failed === 0) {
      reportParts.push('- No critical validation failures detected in this review.\n');
    }
    if (results.warnings > 0) {
      reportParts.push(`- ${results.warnings} warning(s) were raised during validation.\n`);
    }

    reportParts.push(formatSection('Summary'));
    reportParts.push(`- Passed checks: ${results.passed}\n`);
    reportParts.push(`- Warnings: ${results.warnings}\n`);
    reportParts.push(`- Failures: ${results.failed}\n`);

    const finalText = reportParts.join('');
    await fs.writeFile(REPORT_FILE, finalText, 'utf8');
    console.log(`✅ Validation report written to ${REPORT_FILE}`);
    if (results.failed > 0) {
      console.error(`❌ Validation completed with ${results.failed} failure(s) and ${results.warnings} warning(s).`);
      process.exit(1);
    }
    console.log(`⚠️ Validation completed with ${results.warnings} warning(s).`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Post-repair validation failed:', error);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

runValidation();
